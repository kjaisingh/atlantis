import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isExpired } from './jobs.js';

test('subscription remains active throughout its departure date', () => {
  assert.equal(isExpired({ departure_date: '2026-10-13' }, '2026-10-13'), false);
  assert.equal(isExpired({ departure_date: '2026-10-12' }, '2026-10-13'), true);
  assert.equal(isExpired({ departure_date: '2026-10-14' }, '2026-10-13'), false);
});
