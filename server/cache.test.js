import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearch } from './search.js';
import { candidateEndpoints } from './route-graph.js';
import { SearchError } from './errors.js';

const DAY = 86400000;
const graph = {
  period: '2026-07',
  edges: [
    ['JFK', 'DTW', 'DL', 100],
    ['DTW', 'ORD', 'DL', 80],
    ['DTW', 'ATL', 'DL', 100],
    ['DTW', 'JFK', 'DL', 90],
    ['DTW', 'MIA', 'AA', 200],
  ],
};
function harness() {
  let time = Date.parse('2026-10-26T12:00:00Z');
  let route;
  let queries = 0;
  let graphReads = 0;
  const fares = new Map();
  const reservations = [];
  const store = {
    async getCandidates() {
      return route;
    },
    async getGraph() {
      graphReads++;
      return graph;
    },
    async cacheCandidates(_o, _d, candidates, source_period) {
      route = {
        candidates,
        source_period,
        created_at: new Date(time).toISOString(),
        expires_at: new Date(time + 30 * DAY).toISOString(),
        verified_endpoints: [],
      };
      return route;
    },
    async claim(key, owner, calls) {
      if (fares.has(key) && Date.parse(fares.get(key).expires_at) > time)
        return { status: fares.get(key).state, result: fares.get(key).result };
      reservations.push({ key, calls });
      fares.set(key, {
        state: 'pending',
        expires_at: new Date(time + 120000).toISOString(),
        owner,
      });
      return { status: 'owner' };
    },
    async getFare(key) {
      return fares.get(key);
    },
    async finish(key, owner, result, failed) {
      assert.equal(fares.get(key).owner, owner);
      fares.set(key, {
        owner,
        result,
        state: failed ? 'failed' : 'ready',
        expires_at: new Date(time + (failed || result.meta.failed ? 60000 : 600000)).toISOString(),
      });
    },
    async observe(_o, _d, createdAt, endpoints) {
      assert.equal(createdAt, route.created_at);
      route.verified_endpoints = [...new Set([...route.verified_endpoints, ...endpoints])];
    },
  };
  const lookup = async (origin, endpoint, date) => {
    queries++;
    const codes = endpoint === 'DTW' ? [origin, endpoint] : [origin, 'DTW', endpoint];
    return {
      best_flights: [
        {
          price: endpoint === 'DTW' ? 300 : 200,
          flights: codes.slice(1).map((to, i) => ({
            departure_airport: { id: codes[i], time: `${date} 10:00` },
            arrival_airport: { id: to, time: `${date} 12:00` },
            flight_number: `DL ${i}`,
            airline: 'Delta',
          })),
        },
      ],
    };
  };
  return {
    store,
    lookup,
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
    get route() {
      return route;
    },
    get queries() {
      return queries;
    },
    get graphReads() {
      return graphReads;
    },
    reservations,
  };
}
const run = (search, date = '2099-02-28', travelers = 1) => search('JFK', 'DTW', date, travelers);

test('graph ranks same-carrier onward service and excludes starting/exit airports', () => {
  assert.deepEqual(candidateEndpoints('JFK', 'DTW', graph), ['ATL', 'ORD']);
  assert.deepEqual(candidateEndpoints('BOS', 'DTW', graph), []);
});

test('metro onward service must leave the same airport the first carrier reaches', () => {
  const graph = {
    edges: [
      ['JFK', 'DCA', 'AA', 100],
      ['IAD', 'LAX', 'AA', 1000],
      ['DCA', 'ORD', 'AA', 100],
    ],
  };
  assert.deepEqual(candidateEndpoints('JFK', 'WAS', graph), ['ORD']);
});

test('route cache survives dates, party sizes and fare expiry; refreshes exactly at 30 days', async () => {
  const h = harness();
  const search = createSearch(h);
  const initial = await run(search);
  assert.equal(h.queries, 3);
  assert.deepEqual(h.route.verified_endpoints, ['ATL', 'ORD']);
  const createdAt = h.route.created_at;
  const expiresAt = h.route.expires_at;
  assert.equal(initial.meta.fareCached, false);
  assert.equal((await run(search)).meta.fareCached, true);
  assert.equal(h.queries, 3);
  await run(search, '2099-03-01');
  await run(search, '2099-03-01', 2);
  h.advance(600000);
  await run(search);
  assert.equal(h.queries, 12);
  assert.equal(h.graphReads, 1);
  assert.equal(h.route.created_at, createdAt);
  assert.equal(h.route.expires_at, expiresAt);
  h.advance(30 * DAY - 600000);
  await run(search);
  assert.equal(h.graphReads, 2);
  assert.notEqual(h.route.created_at, createdAt);
});

test('simultaneous identical searches share one reservation and one batch of provider calls', async () => {
  const h = harness();
  await run(createSearch(h));
  h.advance(600000);
  const results = await Promise.all([run(createSearch(h)), run(createSearch(h))]);
  assert.equal(h.queries, 6);
  assert.equal(h.reservations.length, 2);
  assert.equal(results.filter((r) => r.meta.fareCached).length, 1);
});

test('partial provider failure preserves usable fares; full failure is negatively cached', async () => {
  const h = harness();
  const partial = createSearch({
    ...h,
    lookup: (...args) =>
      args[1] === 'ATL' ? Promise.reject(new Error('offline')) : h.lookup(...args),
  });
  const result = await run(partial);
  assert.equal(result.meta.failed, 1);
  assert.equal(result.meta.succeeded, 2);
  assert.equal(result.itineraries.length, 2);
  h.advance(600000);
  const failing = createSearch({
    ...h,
    lookup: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(run(failing), /offline/);
  await assert.rejects(run(failing), /Flight search failed/);
});

test('partial fares expire after a minute and can recover without changing route candidates', async () => {
  const h = harness();
  const search = createSearch({
    ...h,
    lookup: (...args) =>
      args[1] === 'ATL' ? Promise.reject(new Error('offline')) : h.lookup(...args),
  });
  await run(search);
  h.advance(59999);
  assert.equal((await run(search)).meta.fareCached, true);
  h.advance(1);
  const recovered = await run(createSearch(h));
  assert.equal(recovered.meta.fareCached, false);
  assert.equal(recovered.meta.partial, false);
  assert.equal(recovered.meta.failed, 0);
  assert.equal(h.graphReads, 1);
});

test('cached failures preserve quota status and reset time', async () => {
  const h = harness();
  const error = new SearchError('Provider quota exhausted.', {
    status: 429,
    code: 'provider_limit',
    resetAt: '2099-03-01T12:00:00Z',
  });
  const search = createSearch({
    ...h,
    lookup: async () => {
      throw error;
    },
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      run(search),
      (e) => e.status === 429 && e.code === error.code && e.resetAt === error.resetAt,
    );
  assert.equal(h.reservations.length, 1);
});

test('observation and cache write failures retain usable fares after quota reservation', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const method of ['observe', 'finish']) {
    const h = harness();
    h.store[method] = async () => {
      throw new Error('storage offline');
    };
    const result = await run(createSearch(h));
    assert.equal(result.itineraries.length, 3);
    assert.equal(h.reservations.length, 1);
  }
});

test('an already aborted search never reserves quota or calls the provider', async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createSearch(h)('JFK', 'DTW', '2099-02-28', 1, { signal: controller.signal }),
  );
  assert.equal(h.reservations.length, 0);
  assert.equal(h.queries, 0);
});

test('budget exhaustion and storage failure prevent any provider calls', async () => {
  const h = harness();
  h.store.claim = async () => ({ status: 'limited', code: 'monthly_limit', resetAt: '2099-01-01' });
  await assert.rejects(
    run(createSearch(h)),
    (error) => error.status === 429 && error.resetAt === '2099-01-01',
  );
  assert.equal(h.queries, 0);
  h.store.claim = async () => {
    throw new Error('storage down');
  };
  await assert.rejects(run(createSearch(h)), /storage down/);
  assert.equal(h.queries, 0);
});
