import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 4173;
const baseUrl = process.env.SMOKE_URL || `http://127.0.0.1:${port}`;
const outDir = process.env.SMOKE_OUT || '/tmp/atlantis-smoke';
const live = process.env.SMOKE_LIVE === '1';
if (live && !process.env.SMOKE_URL && !process.env.DUFFEL_API_KEY) {
  throw new Error('SMOKE_LIVE=1 requires DUFFEL_API_KEY for a local server, or SMOKE_URL.');
}
await mkdir(outDir, { recursive: true });

let server;
if (!process.env.SMOKE_URL) {
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      DUFFEL_API_KEY: live ? process.env.DUFFEL_API_KEY : 'smoke-test-only',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch {
      // Server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (attempt === 39) throw new Error('Smoke-test server did not start.');
  }
}

const browser = await chromium.launch();
const failures = [];

function monitor(page, label, isExpectedConsoleError = () => false) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleError(message)) {
      failures.push(`${label} console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`${label} page: ${error.message}`));
  page.on('requestfailed', (request) =>
    failures.push(`${label} request: ${request.url()} ${request.failure()?.errorText}`),
  );
}

async function mockApi(page, subscriptions = true) {
  if (live) return;
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        version: 'smoke',
        capabilities: { search: true, subscriptions, databaseConfigured: true },
      },
    }),
  );
  await page.route('**/api/airports', (route) =>
    route.fulfill({
      json: [
        { code: 'JFK', city: 'New York', name: 'John F. Kennedy International Airport' },
        { code: 'DTW', city: 'Detroit', name: 'Detroit Metropolitan Airport' },
      ],
    }),
  );
  await page.route('**/api/search', (route) =>
    route.fulfill({
      json: {
        outbound: [
          {
            airline: 'Example Air',
            path: 'JFK → DTW',
            price: '314.00',
            currency: 'USD',
            nonstop: true,
            isHiddenCity: false,
            departureTime: '2099-02-28T07:00:00Z',
            arrivalTime: '2099-02-28T09:00:00Z',
            bookingLink: 'https://example.com/direct',
          },
          {
            airline: 'Example Air',
            path: 'JFK → DTW → ORD',
            price: '188.00',
            currency: 'USD',
            nonstop: false,
            isHiddenCity: true,
            layoverCity: 'DTW',
            departureTime: '2099-02-28T08:00:00Z',
            arrivalTime: '2099-02-28T10:00:00Z',
            bookingLink: 'https://example.com/hidden',
          },
        ],
        meta: {
          outbound: {
            requested: 4,
            succeeded: 4,
            failed: 0,
            truncated: false,
            totalCandidates: 4,
            partial: false,
          },
        },
      },
    }),
  );
  await page.route('**/api/subscribe', (route) =>
    route.fulfill({ status: 201, json: { id: 'test', message: 'Price alert created.' } }),
  );
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let expectSearchFailure = false;
  monitor(
    page,
    'desktop',
    (message) => expectSearchFailure && message.text().includes('502 (Bad Gateway)'),
  );
  await mockApi(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${outDir}/landing-desktop.png`, fullPage: true });

  if (live) {
    const departureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const response = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        origin: 'JFK',
        destination: 'DTW',
        departureDate,
        travelers: 1,
      }),
    });
    if (!response.ok) throw new Error(`Live flight search returned ${response.status}.`);
    const result = await response.json();
    if (!Array.isArray(result.outbound) || result.meta?.outbound?.succeeded < 1) {
      throw new Error('Live flight search returned no successful provider requests.');
    }
    await context.close();
    return;
  }

  await page.getByRole('combobox', { name: 'Origin' }).fill('JFK');
  await page.getByRole('option', { name: /JFK/ }).click();
  await page.getByRole('combobox', { name: 'Destination' }).fill('DTW');
  await page.getByRole('option', { name: /DTW/ }).click();
  await page.locator('#departureDate').fill('2099-02-28');
  await page.getByRole('button', { name: 'Search flights' }).click();
  await page.getByText('$188.00').waitFor();
  await page.locator('a').filter({ hasText: 'Hidden-city' }).waitFor();
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('departure');
  const direct = page.locator('a[href="https://example.com/direct"]');
  const hidden = page.locator('a[href="https://example.com/hidden"]');
  if (await direct.getByText('Lowest price').count()) {
    throw new Error('Departure sort marked the higher fare as lowest price.');
  }
  if ((await hidden.getByText('Lowest price').count()) !== 1) {
    throw new Error('Departure sort lost the lowest-price badge.');
  }
  await page.getByText('Save $126.00 versus the $314.00 nonstop fare').waitFor();
  await page.getByRole('heading', { name: 'Watch this route' }).waitFor();
  await page.screenshot({ path: `${outDir}/results-desktop.png`, fullPage: true });
  if (!live) {
    expectSearchFailure = true;
    await page.route('**/api/search', (route) =>
      route.fulfill({ status: 502, json: { error: 'Search temporarily unavailable.' } }),
    );
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.getByText('Search temporarily unavailable.').waitFor();
    if (await page.getByText('$188.00').count()) {
      throw new Error('Stale search results remained after a failed retry.');
    }
    expectSearchFailure = false;
  }
  await context.close();
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  monitor(page, 'mobile');
  await mockApi(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'How it works' }).waitFor();
  await page.screenshot({ path: `${outDir}/menu-mobile.png`, fullPage: true });
  await context.close();
}

async function runDisabledAlerts() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  monitor(page, 'alerts-disabled');
  await mockApi(page, false);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Origin' }).fill('JFK');
  await page.getByRole('option', { name: /JFK/ }).click();
  await page.getByRole('combobox', { name: 'Destination' }).fill('DTW');
  await page.getByRole('option', { name: /DTW/ }).click();
  await page.locator('#departureDate').fill('2099-02-28');
  await page.getByRole('button', { name: 'Search flights' }).click();
  await page.getByText('$188.00').waitFor();
  await page.screenshot({ path: `${outDir}/alerts-disabled-mobile.png`, fullPage: true });
  await page.getByText('Price alerts are unavailable right now.', { exact: false }).waitFor();
  if (await page.getByRole('heading', { name: 'Watch this route' }).count()) {
    throw new Error('Alert form appeared while subscriptions are disabled.');
  }
  await context.close();
}

try {
  await runDesktop();
  await runMobile();
  if (!live) await runDisabledAlerts();
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Smoke test passed. Screenshots: ${outDir}`);
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
