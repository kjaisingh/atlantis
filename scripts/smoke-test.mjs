import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 4173;
const baseUrl = process.env.SMOKE_URL || `http://127.0.0.1:${port}`;
const outDir = process.env.SMOKE_OUT || '/tmp/atlantis-smoke';
const live = process.env.SMOKE_LIVE === '1';
if (live && !process.env.SMOKE_URL && !process.env.SERPAPI_API_KEY) {
  throw new Error('SMOKE_LIVE=1 requires SERPAPI_API_KEY for a local server, or SMOKE_URL.');
}
await mkdir(outDir, { recursive: true });

let server;
if (!process.env.SMOKE_URL) {
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      SERPAPI_API_KEY: live ? process.env.SERPAPI_API_KEY : 'smoke-test-only',
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

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
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

async function mockApi(page) {
  if (live) return;
  await page.route('**/api/ready', (route) =>
    route.fulfill({
      json: {
        ready: true,
        version: 'smoke',
      },
    }),
  );
  await page.route('**/api/airports', (route) =>
    route.fulfill({
      json: [
        {
          code: 'JFK',
          city: 'New York',
          name: 'John F. Kennedy International Airport',
          airports: ['JFK'],
        },
        {
          code: 'NYC',
          city: 'New York',
          name: 'All airports (JFK, EWR, LGA)',
          airports: ['JFK', 'EWR', 'LGA'],
        },
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
            finalDestination: 'ORD',
            segments: [
              {
                origin: 'JFK',
                destination: 'DTW',
                flightNumber: 'EX 1',
                departureTime: '2099-02-28T08:00:00',
                arrivalTime: '2099-02-28T10:00:00',
              },
              {
                origin: 'DTW',
                destination: 'ORD',
                flightNumber: 'EX 2',
                departureTime: '2099-02-28T11:00:00',
                arrivalTime: '2099-02-28T12:00:00',
              },
            ],
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
            partial: true,
            fareCached: true,
            pricedAt: '2099-01-01T12:00:00Z',
            candidates: ['ORD'],
            candidatesExpiresAt: '2099-01-31T12:00:00Z',
            sourcePeriod: '2098-10',
          },
        },
      },
    }),
  );
}

async function runDesktop() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Pacific/Auckland',
  });
  const page = await context.newPage();
  let expectSearchFailure = false;
  monitor(page, 'desktop', (message) => expectSearchFailure && /502|429/.test(message.text()));
  await mockApi(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const searchBox = await page.getByRole('form', { name: 'Flight search' }).boundingBox();
  const explainer = await page
    .getByRole('heading', { name: 'How hidden-city fares work' })
    .boundingBox();
  if (searchBox.y >= explainer.y) throw new Error('Search is buried below the explainer.');
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

  const originInput = page.getByRole('combobox', { name: 'Origin' });
  await originInput.fill('NoSuchAirport');
  await page.getByText('No matching airport found.').waitFor();
  await originInput.press('Escape');
  if (await page.getByText('No matching airport found.').count())
    throw new Error('Escape did not close empty airport suggestions.');
  await originInput.fill('JFK');
  await originInput.press('Escape');
  await originInput.press('ArrowDown');
  await originInput.press('Enter');
  await page.getByRole('combobox', { name: 'Destination' }).fill('DTW');
  await page.getByRole('option', { name: /DTW/ }).click();
  await page.locator('#departureDate').fill('2099-02-28');
  await page.getByRole('button', { name: 'Search flights' }).click();
  await page.getByText('$188.00').waitFor();
  if (
    await page
      .getByText(
        /Cached fares:|Fares checked:|Limited coverage:|Candidate routes refresh|Free shared allowance/,
      )
      .count()
  )
    throw new Error('Removed metadata copy reappeared.');
  await page.getByText('Ticket endpoints checked: ORD.', { exact: false }).waitFor();
  await page.getByText('Feb 28, 8:00 AM → Feb 28, 10:00 AM').first().waitFor();
  await page.getByText('Feb 28, 2099 · 1 traveler · Economy').waitFor();
  await page.locator('article').filter({ hasText: 'Hidden-city' }).waitFor();
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('departure');
  const direct = page
    .locator('article')
    .filter({ has: page.locator('a[href="https://example.com/direct"]') });
  const hidden = page
    .locator('article')
    .filter({ has: page.locator('a[href="https://example.com/hidden"]') });
  if (await direct.getByText('Lowest price').count()) {
    throw new Error('Departure sort marked the higher fare as lowest price.');
  }
  if ((await hidden.getByText('Lowest price').count()) !== 1) {
    throw new Error('Departure sort lost the lowest-price badge.');
  }
  await page.getByText('Save $126.00 versus the $314.00 nonstop fare').waitFor();
  await page.getByText('Board at JFK; exit at DTW.', { exact: false }).waitFor();
  await hidden.getByText('Flight details', { exact: true }).click();
  await hidden.getByText('Fly: JFK → DTW · EX 1').waitFor();
  await hidden.getByText('Skip: DTW → ORD · EX 2').waitFor();
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
    await page.route('**/api/search', (route) =>
      route.fulfill({
        status: 429,
        json: {
          error: 'The shared daily search limit has been reached.',
          resetAt: '2099-03-01T12:00:00Z',
        },
      }),
    );
    await page.getByRole('button', { name: 'Retry search', exact: true }).click();
    await page.getByText('Next allowance:', { exact: false }).waitFor();
    expectSearchFailure = false;
    await mockApi(page);
    await page.getByRole('button', { name: 'Retry search', exact: true }).click();
    await page.getByText('$188.00').waitFor();
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
  await page.getByRole('link', { name: 'How it works' }).focus();
  await page.keyboard.press('Escape');
  if (
    !(await page
      .getByRole('button', { name: 'Open menu' })
      .evaluate((element) => element === element.ownerDocument.activeElement))
  )
    throw new Error('Menu Escape did not restore focus.');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.screenshot({ path: `${outDir}/menu-mobile.png`, fullPage: true });
  await context.close();
}

async function runRecoveryStates() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  monitor(page, 'recovery', (message) => message.text().includes('503 (Service Unavailable)'));
  await mockApi(page);
  let connected = false;
  await page.route('**/api/ready', (route) =>
    route.fulfill(
      connected ? { json: { ready: true } } : { status: 503, json: { error: 'Unavailable' } },
    ),
  );
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Retry connection' }).waitFor();
  connected = true;
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await page.getByRole('combobox', { name: 'Origin' }).fill('JFK');
  await page.getByRole('option', { name: /^JFK / }).click();
  await page.getByRole('combobox', { name: 'Destination' }).fill('DTW');
  await page.getByRole('option', { name: /DTW/ }).click();
  await page.locator('#departureDate').fill('2099-02-28');
  let result = { outbound: [], meta: { outbound: { requested: 1, succeeded: 1 } } };
  await page.route('**/api/search', (route) => route.fulfill({ json: result }));
  await page.getByRole('button', { name: 'Search flights' }).click();
  await page.getByText('No fares found for this date and route.', { exact: false }).waitFor();
  result = {
    outbound: [
      {
        id: 'direct-eur',
        airline: 'Example Air',
        path: 'JFK → DTW',
        currency: 'EUR',
        price: '100',
        nonstop: true,
        isHiddenCity: false,
        departureTime: '2099-02-28T08:00:00',
        arrivalTime: '2099-02-28T10:00:00',
        duration: 'PT2H',
        bookingLink: 'https://example.com/direct',
      },
    ],
    inbound: [],
    meta: {
      inbound: {
        partial: true,
        error: 'This direction could not be checked. Please retry your search.',
        resetAt: '2099-03-01T12:00:00Z',
      },
    },
  };
  await page.getByRole('button', { name: 'Round-trip', exact: true }).click();
  await page.locator('#returnDate').fill('2099-03-01');
  await page.getByRole('button', { name: 'Search flights' }).click();
  await page.getByText('This direction could not be checked.', { exact: false }).waitFor();
  await page.getByText('Next allowance:', { exact: false }).waitFor();
  await page.getByText('€100.00').waitFor();
  await page.getByText('Travel time: 2h').waitFor();
  await page.getByRole('combobox', { name: 'Outbound itinerary type' }).selectOption('hidden');
  await page.getByText('No itineraries match these filters.').waitFor();
  await page.getByRole('button', { name: 'Show all routes' }).click();
  await page.getByText('€100.00').waitFor();

  if (
    await page
      .locator('html')
      .evaluate((element) => element.scrollWidth > element.ownerDocument.defaultView.innerWidth)
  )
    throw new Error('Mobile results overflow horizontally.');
  await page.screenshot({ path: `${outDir}/recovery-mobile.png`, fullPage: true });
  await context.close();
}

async function runPendingSearch() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  monitor(page, 'pending');
  await mockApi(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Origin' }).fill('NYC');
  await page.getByRole('option', { name: /^NYC / }).click();
  await page.getByRole('combobox', { name: 'Destination' }).fill('JFK');
  await page.getByRole('option', { name: /^JFK / }).click();
  await page.getByText('Choose airports or metro areas that do not overlap.').waitFor();
  if (!(await page.getByRole('button', { name: 'Search flights' }).isDisabled()))
    throw new Error('Overlapping route can be submitted.');
  await page.getByRole('combobox', { name: 'Destination' }).fill('DTW');
  await page.getByRole('option', { name: /^DTW / }).click();
  await page.locator('#departureDate').fill('2099-02-28');
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/search', async (route) => {
    calls++;
    await gate;
    await route.fulfill({ json: { outbound: [], meta: { outbound: { candidates: [] } } } });
  });
  try {
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.getByRole('button', { name: 'Searching…' }).waitFor();
    if (
      !(await page
        .locator('form input, form button')
        .evaluateAll((elements) => elements.every((e) => e.matches(':disabled'))))
    )
      throw new Error('Pending form remains editable.');
    await page.getByRole('form', { name: 'Flight search' }).evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    release();
    await page.getByText('No fares found for this date and route.', { exact: false }).waitFor();
    if (calls !== 1) throw new Error('Duplicate searches reached the API.');
    if (await page.getByRole('combobox', { name: 'Origin' }).isDisabled())
      throw new Error('Form remained locked after completion.');
  } finally {
    release();
    await context.close();
  }
}

try {
  await runDesktop();
  await runMobile();
  if (!live) {
    await runRecoveryStates();
    await runPendingSearch();
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Smoke test passed. Screenshots: ${outDir}`);
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
