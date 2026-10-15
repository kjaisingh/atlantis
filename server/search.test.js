import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterData, filterJSONResult, getBookingLink } from './search.js';
import { pinNonstopFirst } from './routes.js';

// dest kept out of lookup-map.json's real metro groupings on purpose, so these
// tests don't depend on the shape of live cache data.
const DEST = 'ZZZ';

test('malformed Duffel offers are skipped without hiding usable offers', () => {
  const valid = {
    total_amount: '135.00',
    total_currency: 'USD',
    slices: [
      {
        segments: [
          {
            origin: { iata_code: 'JFK' },
            destination: { iata_code: DEST },
            marketing_carrier: { iata_code: 'AA', name: 'Airline' },
            departing_at: '2027-01-01T10:00:00',
            arriving_at: '2027-01-01T12:00:00',
          },
        ],
      },
    ],
  };
  assert.deepEqual(filterJSONResult([null, {}, { ...valid, slices: [] }, valid], DEST), [valid]);
});

function segment({
  carrierCode,
  flightNumber,
  origin,
  destination,
  departureTime,
  arrivalTime,
  carrierName,
}) {
  return {
    carrierCode,
    flightNumber,
    origin,
    destination,
    departureTime,
    arrivalTime,
    carrierName,
  };
}

test('filterData collapses same flight, different fare brand, to the cheapest', () => {
  const flight = {
    carrierCode: 'AA',
    flightNumber: '100',
    origin: 'JFK',
    destination: DEST,
    departureTime: '2026-09-01T08:00:00',
    arrivalTime: '2026-09-01T10:00:00',
    carrierName: 'American',
  };
  const itineraries = [
    { price: 100, segments: [segment(flight)] }, // basic fare, cheapest, arrives first (price-sorted)
    { price: 150, segments: [segment(flight)] }, // same physical flight, refundable fare
  ];

  const results = filterData(itineraries, 1, DEST);

  assert.equal(results.length, 1);
  assert.equal(results[0].price, 100);
});

test('filterData keeps same-price, different-departure-time nonstops as distinct rows', () => {
  const itineraries = [
    {
      price: 358.8,
      segments: [
        segment({
          carrierCode: 'UA',
          flightNumber: '200',
          origin: 'BOS',
          destination: DEST,
          departureTime: '2026-09-01T06:00:00',
          arrivalTime: '2026-09-01T09:00:00',
          carrierName: 'United',
        }),
      ],
    },
    {
      price: 358.8,
      segments: [
        segment({
          carrierCode: 'UA',
          flightNumber: '201',
          origin: 'BOS',
          destination: DEST,
          departureTime: '2026-09-01T07:45:00',
          arrivalTime: '2026-09-01T10:45:00',
          carrierName: 'United',
        }),
      ],
    },
  ];

  const results = filterData(itineraries, 1, DEST);

  assert.equal(results.length, 2);
});

test('filterData classifies a true nonstop as not hidden-city, and a connection past dest as hidden-city', () => {
  const nonstop = {
    price: 100,
    segments: [
      segment({
        carrierCode: 'AA',
        flightNumber: '1',
        origin: 'JFK',
        destination: DEST,
        departureTime: '2026-09-01T08:00:00',
        arrivalTime: '2026-09-01T10:00:00',
        carrierName: 'American',
      }),
    ],
  };
  const hiddenCity = {
    price: 90,
    segments: [
      segment({
        carrierCode: 'AA',
        flightNumber: '2',
        origin: 'JFK',
        destination: DEST,
        departureTime: '2026-09-01T08:00:00',
        arrivalTime: '2026-09-01T10:00:00',
        carrierName: 'American',
      }),
      segment({
        carrierCode: 'AA',
        flightNumber: '3',
        origin: DEST,
        destination: 'ORD',
        departureTime: '2026-09-01T11:00:00',
        arrivalTime: '2026-09-01T12:30:00',
        carrierName: 'American',
      }),
    ],
  };

  const results = filterData([nonstop, hiddenCity], 1, DEST);
  const nonstopEntry = results.find((r) => r.price === 100);
  const hiddenCityEntry = results.find((r) => r.price === 90);

  assert.equal(nonstopEntry.isHiddenCity, false);
  assert.equal(nonstopEntry.nonstop, true);
  assert.equal(hiddenCityEntry.isHiddenCity, true);
  assert.equal(hiddenCityEntry.layoverCity, DEST);
  assert.equal(hiddenCityEntry.nonstop, false);
});

test('pinNonstopFirst moves the first nonstop to the front and leaves other order intact', () => {
  const itineraries = [
    { id: 1, nonstop: false },
    { id: 2, nonstop: false },
    { id: 3, nonstop: true },
    { id: 4, nonstop: false },
  ];

  const result = pinNonstopFirst(itineraries);

  assert.deepEqual(
    result.map((i) => i.id),
    [3, 1, 2, 4],
  );
});

test('pinNonstopFirst is a no-op when no itinerary is a nonstop', () => {
  const itineraries = [
    { id: 1, nonstop: false },
    { id: 2, nonstop: false },
  ];

  const result = pinNonstopFirst(itineraries);

  assert.deepEqual(
    result.map((i) => i.id),
    [1, 2],
  );
});

test('pinNonstopFirst is a no-op when the nonstop is already first', () => {
  const itineraries = [
    { id: 1, nonstop: true },
    { id: 2, nonstop: false },
  ];

  const result = pinNonstopFirst(itineraries);

  assert.deepEqual(
    result.map((i) => i.id),
    [1, 2],
  );
});

test('getBookingLink builds a Kayak URL with the route, date, party size, airline, and layover', () => {
  const link = getBookingLink('JFK', 'ORD', '2026-09-01', 'AA', ['DTW'], 2);

  assert.equal(
    link,
    'https://www.kayak.com/flights/JFK-ORD/2026-09-01/2adults?sort=price_a&fs=airlines%3D~AA%3Bstops%3D~1%3Blayoverair%3DDTW',
  );
});

test('getBookingLink handles a nonstop (no layovers)', () => {
  const link = getBookingLink('JFK', 'ORD', '2026-09-01', 'AA', [], 1);

  assert.equal(
    link,
    'https://www.kayak.com/flights/JFK-ORD/2026-09-01/1adults?sort=price_a&fs=airlines%3D~AA%3Bstops%3D~0%3Blayoverair%3D',
  );
});
