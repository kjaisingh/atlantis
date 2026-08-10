import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const baseUrl = process.env.SMOKE_URL || 'http://localhost:5173';
const outDir = process.env.SMOKE_OUT || '/tmp/atlantis-smoke';
mkdirSync(outDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch();

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`[shot] ${name}`);
}

// --- Desktop pass ---
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await shot(page, '01-landing-desktop');

await page.evaluate(() => document.querySelector('#how-it-works')?.scrollIntoView());
await shot(page, '02-how-it-works-desktop');

await page.evaluate(() => document.querySelector('#search')?.scrollIntoView());
await shot(page, '03-search-form-desktop');

// Fill the search form and run a real search
await page.getByRole('combobox', { name: 'Origin', exact: true }).fill('JFK');
await page.getByRole('option', { name: /JFK/ }).first().click().catch(() => {});
await page.getByRole('combobox', { name: 'Destination', exact: true }).fill('DTW');
await page.getByRole('option', { name: /DTW/ }).first().click().catch(() => {});

const departure = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
await page.locator('input[type="date"]').first().fill(departure);

await shot(page, '04-search-form-filled');

console.log('[search] submitting, this can take up to a minute against the live Duffel API...');
await page.getByRole('button', { name: /search flights/i }).click();

await shot(page, '05-search-loading');

try {
  await page.waitForSelector('text=/Outbound|No itineraries found/i', { timeout: 90000 });
  await shot(page, '06-search-results');
  const bodyText = await page.textContent('body');
  console.log('[search] results rendered:', /No itineraries found/i.test(bodyText) ? 'empty' : 'itineraries present');
} catch (err) {
  await shot(page, '06-search-timeout');
  console.error('[search] timed out waiting for results:', err.message);
}

// --- Mobile pass ---
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mobile.newPage();
mpage.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`[mobile] ${msg.text()}`);
});
await mpage.goto(baseUrl, { waitUntil: 'networkidle' });
await shot(mpage, '07-landing-mobile');

await mpage.getByRole('button', { name: /open menu/i }).click();
await shot(mpage, '08-mobile-menu-open');

await browser.close();

console.log('\n--- console errors ---');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
console.log('--- page errors ---');
console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
console.log(`\nScreenshots written to ${outDir}`);

if (consoleErrors.length || pageErrors.length) process.exit(1);
