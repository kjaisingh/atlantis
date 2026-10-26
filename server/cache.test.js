import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearch } from './search.js';
import { candidateEndpoints } from './route-graph.js';

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
        expires_at: new Date(time + (failed ? 60000 : 600000)).toISOString(),
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
  await assert.rejects(run(failing), /recently failed/);
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
