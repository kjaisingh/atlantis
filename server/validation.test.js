import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidFutureDate, todayUtc, validateSubscriber, validateTrip } from './validation.js';

const now = new Date('2026-10-13T12:00:00Z');
const airports = new Set(['JFK', 'DTW']);

test('numeric fields reject booleans, arrays, objects, and empty values', () => {
  for (const value of [true, false, null, [], [2], {}, '', ' ']) {
    assert.ok(
      validateTrip(
        { origin: 'JFK', destination: 'DTW', departureDate: '2026-10-14', travelers: value },
        airports,
        now,
      ).error,
    );
    assert.ok(
      validateSubscriber({
        name: 'Jane',
        email: 'jane@example.com',
        currency: 'USD',
        priceThreshold: value,
      }).error,
    );
  }
});

test('date fields reject non-string JSON values', () => {
  for (const returnDate of [false, 0, ['2026-10-15'], {}]) {
    assert.ok(
      validateTrip(
        {
          origin: 'JFK',
          destination: 'DTW',
          departureDate: '2026-10-14',
          travelers: 1,
          returnDate,
        },
        airports,
        now,
      ).error,
    );
  }
});

test('date validation rejects rollover dates and past dates', () => {
  assert.equal(isValidFutureDate('2027-02-29', now), false);
  assert.equal(isValidFutureDate('2026-02-30', now), false);
  assert.equal(isValidFutureDate('2026-10-12', now), false);
  assert.equal(isValidFutureDate('2026-10-13', now), true);
});
test('today uses UTC calendar date at timezone boundaries', () => {
  assert.equal(
    todayUtc(new Date('2026-10-13T23:30:00Z')).toISOString(),
    '2026-10-13T00:00:00.000Z',
  );
});

test('trip validation normalizes airport codes and numeric travelers', () => {
  const result = validateTrip(
    { origin: ' jfk ', destination: 'dtw', departureDate: '2026-10-14', travelers: '2' },
    airports,
    now,
  );
  assert.deepEqual(result.value, {
    origin: 'JFK',
    destination: 'DTW',
    departureDate: '2026-10-14',
    returnDate: '',
    travelers: 2,
  });
});

test('subscriber validation normalizes identity and requires ISO currency', () => {
  const valid = validateSubscriber({
    name: ' Jane ',
    email: ' JANE@EXAMPLE.COM ',
    priceThreshold: '250.50',
    currency: 'usd',
  });
  assert.deepEqual(valid.value, {
    name: 'Jane',
    email: 'jane@example.com',
    priceThreshold: 250.5,
    currency: 'USD',
  });
  assert.match(
    validateSubscriber({ name: 'Jane', email: 'bad', priceThreshold: 1 }).error,
    /valid/,
  );
});
