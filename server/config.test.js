import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.js';

const alertEnvironment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'user',
  SMTP_PASS: 'password',
  SMTP_FROM: 'Atlantis <alerts@example.com>',
};

test('new alerts remain disabled until the current schema is confirmed', () => {
  assert.equal(loadConfig(alertEnvironment).subscriptionsEnabled, false);
  assert.equal(
    loadConfig({ ...alertEnvironment, SUBSCRIPTION_SCHEMA_VERSION: '20261013' })
      .subscriptionsEnabled,
    true,
  );
});

test('partial optional service configuration fails fast', () => {
  assert.throws(() => loadConfig({ SUPABASE_URL: 'https://example.supabase.co' }), /all or none/);
});
