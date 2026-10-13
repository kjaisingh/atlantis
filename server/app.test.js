import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';

const config = {
  commitSha: 'test-sha',
  duffelConfigured: true,
  subscriptionsEnabled: false,
};
const database = { isEnabled: () => false };
const jobRunner = { checkSubscriptions: async () => ({ checked: 0, matched: 0 }) };
const searchFlights = async () => ({
  itineraries: [{ price: '100', currency: 'USD', nonstop: true }],
  meta: { requested: 1, succeeded: 1, failed: 0, partial: false },
});
let server;
let baseUrl;

before(async () => {
  const app = createApp({ config, database, jobRunner, searchFlights });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('health exposes safe capabilities and deployment version', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    version: 'test-sha',
    capabilities: { search: true, subscriptions: false },
  });
});

test('invalid JSON and impossible dates return 400', async () => {
  const invalidJson = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidJson.status, 400);

  const impossibleDate = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: 'JFK',
      destination: 'DTW',
      departureDate: '2099-02-30',
      travelers: 1,
    }),
  });
  assert.equal(impossibleDate.status, 400);
});

test('oversized JSON returns 413', async () => {
  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(17_000) }),
  });
  assert.equal(response.status, 413);
});

test('subscriptions fail closed when delivery is unavailable', async () => {
  const response = await fetch(`${baseUrl}/api/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 503);
});

test('valid search returns result metadata', async () => {
  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: 'JFK',
      destination: 'DTW',
      departureDate: '2099-02-28',
      travelers: 1,
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.outbound[0].currency, 'USD');
  assert.equal(body.meta.outbound.partial, false);
});
