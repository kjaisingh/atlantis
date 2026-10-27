import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.js';

test('search requires both a server-side key and persistent quota storage', () => {
  assert.equal(loadConfig({ SERPAPI_API_KEY: 'test' }).searchConfigured, false);
  assert.equal(
    loadConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' })
      .searchConfigured,
    false,
  );
  assert.equal(
    loadConfig({
      SERPAPI_API_KEY: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test',
    }).searchConfigured,
    true,
  );
  assert.throws(() => loadConfig({ SUPABASE_URL: 'partial' }), /all or none/);
  assert.throws(() => loadConfig({ PORT: 'invalid' }), /PORT/);
});

test('alerts require explicit opt-in, complete credentials, and a canonical HTTPS origin', () => {
  const env = {
    SERPAPI_API_KEY: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test',
    ALERTS_ENABLED: 'true',
    BREVO_API_KEY: 'test',
    ALERT_FROM_EMAIL: 'sender@example.com',
    APP_URL: 'https://example.com',
    JOB_SECRET: 'x'.repeat(32),
  };
  assert.equal(loadConfig(env).alertsConfigured, true);
  for (const key of [
    'ALERTS_ENABLED',
    'BREVO_API_KEY',
    'ALERT_FROM_EMAIL',
    'APP_URL',
    'JOB_SECRET',
  ])
    assert.equal(loadConfig({ ...env, [key]: '' }).alertsConfigured, false);
  for (const APP_URL of [
    'http://example.com',
    'https://example.com/path',
    'https://user:pass@example.com',
    'https://example.com/#token',
  ])
    assert.throws(() => loadConfig({ ...env, APP_URL }));
});
