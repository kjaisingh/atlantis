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
