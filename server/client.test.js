import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAirportTime, formatDate, formatDuration } from '../src/lib/format.js';
import { getAirports } from '../src/lib/api.js';

test('flight clocks and calendar dates stay independent of the viewer timezone', () => {
  assert.equal(formatAirportTime('2099-02-28T08:15:00'), 'Feb 28, 8:15 AM');
  assert.equal(formatAirportTime('2099-02-28T08:15:00+09:00'), 'Feb 28, 8:15 AM');
  assert.equal(formatAirportTime('2099-02-28T08:15:00Z'), 'Feb 28, 8:15 AM');
  assert.equal(formatDate('2099-02-28'), 'Feb 28, 2099');
  assert.equal(formatDuration('P1DT2H30M'), '26h 30m');
  assert.equal(formatDuration('PT45M'), '45m');
  assert.equal(formatDuration('PT175M'), '2h 55m');
  assert.equal(formatDuration(undefined), null);
});

test('malformed JSON becomes an actionable client error', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  );
  await assert.rejects(getAirports(), /incomplete response.*try again/);
});

test('server error messages and connection failures remain actionable', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: 'Too many searches.' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
  );
  await assert.rejects(getAirports(), /Too many searches/);
  fetch.mock.mockImplementation(async () => {
    throw new TypeError('offline');
  });
  await assert.rejects(getAirports(), /Check your connection/);
});
