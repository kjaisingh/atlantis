import { createClient } from '@supabase/supabase-js';
import { SearchError } from './errors.js';

export function createStore(client) {
  async function result(query) {
    const { data, error } = await query;
    if (error)
      throw new SearchError('Search storage is unavailable. Please try again later.', {
        status: 503,
      });
    return data;
  }
  const requireClient = () => {
    if (!client) throw new SearchError('Search storage is not configured.', { status: 503 });
    return client;
  };
  const table = (name) => requireClient().from(name);
  const rpc = (name, params) => result(requireClient().rpc(name, params));
  return {
    getCandidates: (origin, destination) =>
      result(
        table('atlantis_route_cache')
          .select('*')
          .eq('origin', origin)
          .eq('destination', destination)
          .maybeSingle(),
      ),
    getGraph: async () =>
      (await result(table('atlantis_route_graph').select('data').eq('id', true).single())).data,
    cacheCandidates: (origin, destination, candidates, period) =>
      rpc('atlantis_cache_candidates', {
        p_origin: origin,
        p_destination: destination,
        p_candidates: candidates,
        p_source_period: period,
      }),
    observe: (origin, destination, createdAt, endpoints) =>
      rpc('atlantis_observe_routes', {
        p_origin: origin,
        p_destination: destination,
        p_created_at: createdAt,
        p_endpoints: endpoints,
      }),
    claim: (key, owner, calls) =>
      rpc('atlantis_claim_search', { p_key: key, p_owner: owner, p_calls: calls }),
    getFare: (key) => result(table('atlantis_fare_cache').select('*').eq('key', key).maybeSingle()),
    finish: (key, owner, payload, failed = false) =>
      result(
        table('atlantis_fare_cache')
          .update({
            state: failed ? 'failed' : 'ready',
            result: payload,
            expires_at: new Date(Date.now() + (failed ? 60_000 : 600_000)).toISOString(),
          })
          .eq('key', key)
          .eq('owner', owner)
          .eq('state', 'pending'),
      ),
  };
}

let store;
export function getStore() {
  if (!store) {
    const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
    store = createStore(
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (url, options) =>
                fetch(url, { ...options, signal: AbortSignal.timeout(10_000) }),
            },
          })
        : null,
    );
  }
  return store;
}
