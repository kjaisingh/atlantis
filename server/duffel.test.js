import assert from 'node:assert/strict';
import { test } from 'node:test';

async function client(t) {
  const previous = process.env.DUFFEL_API_KEY;
  process.env.DUFFEL_API_KEY = 'test-only';
  t.after(() => {
    if (previous === undefined) delete process.env.DUFFEL_API_KEY;
    else process.env.DUFFEL_API_KEY = previous;
  });
  return import(`./duffel.js?test=${encodeURIComponent(t.name)}`);
}

const offers = () => new Response(JSON.stringify({ data: { offers: [] } }));

test('Duffel sends the route and party size and rejects permanent failures without retry', async (t) => {
  const { oneWayLookup } = await client(t);
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.data.slices, [
      { origin: 'JFK', destination: 'DTW', departure_date: '2099-01-01' },
    ]);
    assert.equal(body.data.passengers.length, 2);
    return new Response('{}', { status: 401 });
  });
  await assert.rejects(oneWayLookup('JFK', 'DTW', '2099-01-01', 2), /status 401/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('queued cancellation removes the waiter and never launches a stale request', async (t) => {
  const { oneWayLookup } = await client(t);
  const releases = [];
  let active = 0;
  let peak = 0;
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        releases.push(() => {
          active -= 1;
          resolve(offers());
        });
      }),
  );
  const running = Array.from({ length: 3 }, () => oneWayLookup('JFK', 'DTW', '2099-01-01', 1));
  await new Promise((resolve) => setImmediate(resolve));
  const controller = new AbortController();
  const queued = oneWayLookup('JFK', 'DTW', '2099-01-01', 1, { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, { name: 'AbortError' });
  releases.splice(0).forEach((release) => release());
  await Promise.all(running);
  assert.equal(fetch.mock.callCount(), 3);
  const next = oneWayLookup('JFK', 'DTW', '2099-01-01', 1);
  await new Promise((resolve) => setImmediate(resolve));
  releases.shift()();
  await next;
  assert.equal(peak, 3);
});

test('cancellation interrupts exhausted rate budgets and releases capacity', async (t) => {
  const { oneWayLookup } = await client(t);
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ data: { offers: [] } }), {
        headers: {
          'ratelimit-limit': '1',
          'ratelimit-remaining': '0',
          'ratelimit-reset': new Date(Date.now() + 60_000).toISOString(),
        },
      }),
  );
  await oneWayLookup('JFK', 'DTW', '2099-01-01', 1);
  const controller = new AbortController();
  const pending = Array.from({ length: 4 }, () =>
    oneWayLookup('JFK', 'DTW', '2099-01-01', 1, { signal: controller.signal }),
  );
  const settled = Promise.allSettled(pending);
  setTimeout(() => controller.abort(), 20);
  assert.ok((await settled).every((result) => result.status === 'rejected'));
  assert.equal(fetch.mock.callCount(), 1);
});

test('cancellation interrupts retry backoff without another provider request', async (t) => {
  const { oneWayLookup } = await client(t);
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    setTimeout(() => controller.abort(), 20);
    return new Response('{}', { status: 503 });
  });
  await assert.rejects(oneWayLookup('JFK', 'DTW', '2099-01-01', 1, { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test('cancellation reaches an in-flight fetch', async (t) => {
  const { oneWayLookup } = await client(t);
  const controller = new AbortController();
  t.mock.method(
    globalThis,
    'fetch',
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        setTimeout(() => controller.abort(), 20);
      }),
  );
  await assert.rejects(oneWayLookup('JFK', 'DTW', '2099-01-01', 1, { signal: controller.signal }), {
    name: 'AbortError',
  });
});

test('oversized streamed responses stop reading at the byte limit', async (t) => {
  const { oneWayLookup } = await client(t);
  let cancelled = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(1_100_000));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(oneWayLookup('JFK', 'DTW', '2099-01-01', 1), /allowed size/);
  assert.equal(cancelled, true);
});
