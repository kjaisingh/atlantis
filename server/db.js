import { createClient } from '@supabase/supabase-js';
import { SearchError } from './errors.js';

export function createStore(client) {
  async function result(query, { signal } = {}) {
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
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
  const rpc = (name, params, options) => result(requireClient().rpc(name, params), options);
  return {
    getCandidates: (origin, destination, options) =>
      result(
        table('atlantis_route_cache')
          .select('*')
          .eq('origin', origin)
          .eq('destination', destination)
          .maybeSingle(),
        options,
      ),
    getGraph: async (options) =>
      (await result(table('atlantis_route_graph').select('data').eq('id', true).single(), options))
        .data,
    readiness: (options) => rpc('atlantis_readiness', {}, options),
    cacheCandidates: (origin, destination, candidates, period, options) =>
      rpc(
        'atlantis_cache_candidates',
        {
          p_origin: origin,
          p_destination: destination,
          p_candidates: candidates,
          p_source_period: period,
        },
        options,
      ),
    observe: (origin, destination, createdAt, endpoints, options) =>
      rpc(
        'atlantis_observe_routes',
        {
          p_origin: origin,
          p_destination: destination,
          p_created_at: createdAt,
          p_endpoints: endpoints,
        },
        options,
      ),
    claim: (key, owner, calls, options) =>
      rpc('atlantis_claim_search', { p_key: key, p_owner: owner, p_calls: calls }, options),
    claimAlert: (key, owner, calls, options) =>
      rpc('atlantis_claim_alert_search', { p_key: key, p_owner: owner, p_calls: calls }, options),
    createAlert: (params) => rpc('atlantis_create_alert', params),
    alertAction: (hash, action) => rpc('atlantis_alert_action', { p_hash: hash, p_action: action }),
    claimAlerts: (owner) => rpc('atlantis_claim_alerts', { p_owner: owner }),
    finishAlert: (id, owner, outcome) =>
      rpc('atlantis_finish_alert', { p_id: id, p_owner: owner, p_outcome: outcome }),
    getFare: (key, options) =>
      result(table('atlantis_fare_cache').select('*').eq('key', key).maybeSingle(), options),
    finish: (key, owner, payload, failed = false, options) =>
      rpc(
        'atlantis_finish_search',
        { p_key: key, p_owner: owner, p_result: payload, p_failed: failed },
        options,
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
                fetch(url, {
                  ...options,
                  signal: options?.signal
                    ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
                    : AbortSignal.timeout(10_000),
                }),
            },
          })
        : null,
    );
  }
  return store;
}
