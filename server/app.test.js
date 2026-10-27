import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';
import { SearchError } from './errors.js';

const config = {
  commitSha: 'test-sha',
  searchConfigured: true,
  persistenceEnabled: false,
};
const searchFlights = async () => ({
  itineraries: [{ price: '100', currency: 'USD', nonstop: true }],
  meta: { requested: 1, succeeded: 1, failed: 0, partial: false },
});
let server;
let baseUrl;

before(async () => {
  const app = createApp({ config, searchFlights });
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
    capabilities: { search: true, alerts: false, databaseConfigured: false },
  });
});

test('readiness checks database and graph, caches concurrent probes, and hides errors', async () => {
  for (const state of ['ready', 'empty', 'offline', 'unconfigured']) {
    let calls = 0;
    const app = createApp({
      config: { ...config, searchConfigured: state !== 'unconfigured' },
      readiness: async () => {
        calls++;
        if (state === 'offline') throw new Error('secret database detail');
        return { ready: state === 'ready', internal: 'private' };
      },
    });
    const instance = app.listen(0);
    await new Promise((resolve) => instance.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${instance.address().port}/api/ready`;
      const responses = await Promise.all([fetch(url), fetch(url)]);
      for (const response of responses) {
        assert.equal(response.status, state === 'ready' ? 200 : 503);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(await response.text(), /secret|private/);
      }
      assert.equal(calls, state === 'unconfigured' ? 0 : 1);
    } finally {
      await new Promise((resolve) => instance.close(resolve));
    }
  }
});

test('overlapping metro routes are rejected before search reservation', async () => {
  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: 'NYC',
      destination: 'JFK',
      departureDate: '2099-02-28',
      travelers: 1,
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /same airport/);
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

test('quota errors preserve the reset time and Retry-After without leaking provider details', async () => {
  const resetAt = new Date(Date.now() + 60000).toISOString();
  const limited = createApp({
    config,
    searchFlights: async () => {
      throw new SearchError('Shared daily limit reached.', {
        status: 429,
        code: 'daily_limit',
        resetAt,
      });
    },
  }).listen(0);
  await new Promise((resolve) => limited.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${limited.address().port}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: 'JFK',
        destination: 'DTW',
        departureDate: '2099-02-28',
        travelers: 1,
      }),
    });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('Retry-After')) > 0);
    assert.deepEqual(await response.json(), {
      error: 'Shared daily limit reached.',
      code: 'daily_limit',
      resetAt,
    });
  } finally {
    await new Promise((resolve) => limited.close(resolve));
  }
});

test('round trips retain the successful direction and identify failed directions', async () => {
  for (const failedOrigin of ['JFK', 'DTW', 'both']) {
    const app = createApp({
      config,
      searchFlights: async (origin, _destination, _date, _travelers, options) => {
        assert.ok(options.signal instanceof AbortSignal);
        if (origin === failedOrigin || failedOrigin === 'both')
          throw new Error('Provider unavailable');
        return searchFlights();
      },
    });
    const partialServer = app.listen(0);
    await new Promise((resolve) => partialServer.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${partialServer.address().port}/api/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: 'JFK',
          destination: 'DTW',
          departureDate: '2099-02-28',
          returnDate: '2099-03-01',
          travelers: 1,
        }),
      });
      assert.equal(response.status, failedOrigin === 'both' ? 502 : 200);
      const body = await response.json();
      if (failedOrigin !== 'both') {
        const failed = failedOrigin === 'JFK' ? 'outbound' : 'inbound';
        const succeeded = failedOrigin === 'JFK' ? 'inbound' : 'outbound';
        assert.deepEqual(body[failed], []);
        assert.match(body.meta[failed].error, /Flight search failed/);
        assert.equal(body[succeeded].length, 1);
      }
    } finally {
      await new Promise((resolve) => partialServer.close(resolve));
    }
  }
});
