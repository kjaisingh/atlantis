import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidFutureDate, validateSubscriber, validateTrip } from './validation.js';

const now = new Date('2026-10-13T12:00:00Z');
const airports = new Set(['JFK', 'DTW']);

test('date validation rejects rollover dates and past dates', () => {
  assert.equal(isValidFutureDate('2027-02-29', now), false);
  assert.equal(isValidFutureDate('2026-02-30', now), false);
  assert.equal(isValidFutureDate('2026-10-12', now), false);
  assert.equal(isValidFutureDate('2026-10-13', now), true);
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
