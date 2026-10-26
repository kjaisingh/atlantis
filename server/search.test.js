import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinNonstopFirst, selectResults } from './routes.js';
test('result limits retain every currency and each currency nonstop comparison', () => {
  const flights = ['EUR', 'USD'].flatMap((currency) =>
    Array.from({ length: 15 }, (_, i) => ({ currency, price: 100 + i, nonstop: i === 14 })),
  );
  const selected = selectResults(flights);
  assert.equal(selected.length, 20);
  for (const currency of ['EUR', 'USD']) {
    const group = selected.filter((flight) => flight.currency === currency);
    assert.equal(group.length, 10);
    assert.equal(group[0].nonstop, true);
    assert.equal(group[1].price, 100);
  }
});

test('a full page of cheaper ordinary fares cannot hide every hidden-city comparison', () => {
  const ordinary = Array.from({ length: 12 }, (_, index) => ({
    currency: 'USD',
    price: 100 + index,
    nonstop: true,
  }));
  const hidden = { currency: 'USD', price: 200, isHiddenCity: true };
  const selected = selectResults([...ordinary, hidden]);
  assert.equal(selected.length, 10);
  assert.equal(selected[0], ordinary[0]);
  assert.ok(selected.includes(hidden));
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
