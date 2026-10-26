import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeOffers, oneWayLookup, requestUrl } from './serpapi.js';

const options = {
  origin: 'JFK',
  destination: 'DTW',
  endpoint: 'ORD',
  date: '2099-02-28',
  travelers: 1,
};
export function flight(from, to, number = 'DL 1') {
  return {
    departure_airport: { id: from, time: '2099-02-28 10:00' },
    arrival_airport: { id: to, time: '2099-02-28 12:00' },
    flight_number: number,
    airline: 'Delta',
  };
}
const offer = {
  price: 174,
  total_duration: 300,
  flights: [flight('JFK', 'DTW'), flight('DTW', 'ORD', 'DL 2')],
};

test('hidden-city fares preserve the full ticket and stop displayed arrival at the exit', () => {
  const [result] = normalizeOffers({ best_flights: [offer] }, options);
  assert.equal(result.path, 'JFK → DTW → ORD');
  assert.equal(result.finalDestination, 'ORD');
  assert.equal(result.layoverCity, 'DTW');
  assert.equal(result.arrivalTime, '2099-02-28T12:00');
  assert.equal(result.isHiddenCity, true);
  assert.equal(result.nonstop, false);
  assert.equal(result.price, 174);
  assert.equal(new URL(result.bookingLink).origin, 'https://www.google.com');
  assert.equal(new URL(result.bookingLink).pathname, '/travel/flights');
});

test('reject wrong boarding origins, disconnected segments, missing exits and wrong endpoints', () => {
  for (const flights of [
    [flight('BOS', 'JFK'), ...offer.flights],
    [flight('EWR', 'DTW'), flight('DTW', 'ORD')],
    [flight('JFK', 'DTW'), flight('BOS', 'ORD')],
    [flight('JFK', 'ATL'), flight('ATL', 'ORD')],
    [flight('JFK', 'DTW'), flight('DTW', 'LAX')],
  ])
    assert.deepEqual(normalizeOffers({ best_flights: [{ ...offer, flights }] }, options), []);
});

test('malformed offers do not hide valid fares; exact date and local timestamps are enforced', () => {
  for (const bad of [
    null,
    {},
    { ...offer, price: '174' },
    { ...offer, price: -1 },
    { ...offer, flights: [null] },
    { ...offer, flights: [flight('JFK', 'ORD')] },
  ]) {
    assert.equal(normalizeOffers({ best_flights: [bad, offer] }, options).length, 1);
  }
  assert.deepEqual(
    normalizeOffers({ best_flights: [offer] }, { ...options, date: '2099-03-01' }),
    [],
  );
  assert.equal(normalizeOffers({ best_flights: [offer] }, { ...options, origin: 'NYC' }).length, 1);
});

test('nonstop fares remain ordinary comparisons and unsafe provider links are replaced', () => {
  const [result] = normalizeOffers(
    {
      best_flights: [{ price: 200, flights: [flight('JFK', 'DTW')] }],
      search_metadata: { google_flights_url: 'https://evil.example/travel/flights' },
    },
    { ...options, endpoint: 'DTW' },
  );
  assert.equal(result.nonstop, true);
  assert.equal(result.isHiddenCity, false);
  assert.equal(new URL(result.bookingLink).hostname, 'www.google.com');
});

test('invalid local calendar dates and clock times are rejected', () => {
  for (const time of [
    '2099-02-30 12:00',
    '2099-02-28 24:00',
    '2099-02-28 10:60',
    '2099-02-28 10:00:60',
  ]) {
    const flights = structuredClone(offer.flights);
    flights[0].arrival_airport.time = time;
    assert.deepEqual(normalizeOffers({ best_flights: [{ ...offer, flights }] }, options), []);
  }
});

test('provider requests use one-way fares and expand only explicitly selected metros', () => {
  const params = requestUrl('NYC', 'DTW', options.date, 2, 'test').searchParams;
  assert.equal(params.get('type'), '2');
  assert.equal(params.get('adults'), '2');
  assert.deepEqual(params.get('departure_id').split(',').sort(), ['EWR', 'JFK', 'LGA']);
  assert.equal(params.get('arrival_id'), 'DTW');
});

test('provider errors are sanitized, bounded and never retried', async () => {
  for (const response of [
    new Response('secret', { status: 429 }),
    new Response('{'),
    Response.json({ error: 'secret' }),
    new Response('x', { headers: { 'content-length': '5000001' } }),
  ]) {
    let calls = 0;
    await assert.rejects(
      oneWayLookup('JFK', 'DTW', options.date, 1, {
        key: 'secret',
        fetcher: async () => {
          calls++;
          return response;
        },
      }),
      (error) => !error.message.includes('secret'),
    );
    assert.equal(calls, 1);
  }
  assert.deepEqual(
    await oneWayLookup('JFK', 'DTW', options.date, 1, {
      key: 'test',
      fetcher: async () =>
        Response.json({ search_metadata: { status: 'Success' }, error: 'No flights' }),
    }),
    { search_metadata: { status: 'Success' }, error: 'No flights' },
  );
});
