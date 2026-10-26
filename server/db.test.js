import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createStore } from './db.js';

function storeWith(fetcher) {
  return createStore(
    createClient('https://example.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    }),
  );
}

test('database queries carry the request deadline and retain server-owned expiry', async () => {
  const signal = AbortSignal.timeout(1000);
  const saved = { itineraries: [], meta: { failed: 0, fareExpiresAt: '2099-01-01T00:10:00Z' } };
  const requests = [];
  const store = storeWith(async (url, options) => {
    requests.push({ url, options });
    return Response.json(saved);
  });
  const result = await store.finish(
    'abc',
    'owner',
    { itineraries: [], meta: { failed: 0 } },
    false,
    { signal },
  );
  assert.deepEqual(result, saved);
  assert.equal(requests[0].options.signal, signal);
  assert.equal(new URL(requests[0].url).pathname, '/rest/v1/rpc/atlantis_finish_search');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_key: 'abc',
    p_owner: 'owner',
    p_result: { itineraries: [], meta: { failed: 0 } },
    p_failed: false,
  });
});

test('database failures are safe and prevent uncontrolled searches', async () => {
  const store = storeWith(async () =>
    Response.json({ message: 'private database internals' }, { status: 503 }),
  );
  await assert.rejects(
    store.claim('abc', 'owner', 4),
    (error) => error.status === 503 && !error.message.includes('private'),
  );
  assert.throws(() => createStore(null).claim('abc', 'owner', 4), /not configured/);
});
