import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { getStore } from './db.js';
import { candidateEndpoints } from './route-graph.js';
import { normalizeOffers, oneWayLookup, SEARCH_TIMEOUT_MS } from './serpapi.js';
import { publicError, SearchError } from './errors.js';

function cachedFailure(result) {
  return new SearchError(
    result?.message || 'This search recently failed. Please wait a minute before retrying.',
    result || {},
  );
}

export function createSearch({
  store,
  lookup = oneWayLookup,
  now = () => Date.now(),
  alert = false,
}) {
  return async function search(origin, destination, date, travelers, options = {}) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)])
      : AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const dbOptions = { signal };
    let route = await store.getCandidates(origin, destination, dbOptions);
    if (!route || !(Date.parse(route.expires_at) > now())) {
      const graph = await store.getGraph(dbOptions);
      route = await store.cacheCandidates(
        origin,
        destination,
        candidateEndpoints(origin, destination, graph),
        graph.period,
        dbOptions,
      );
    }
    const endpoints = [destination, ...route.candidates];
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          'serpapi-v1',
          origin,
          destination,
          date,
          travelers,
          'USD',
          route.created_at,
          endpoints,
        ]),
      )
      .digest('hex');
    const owner = randomUUID();
    signal.throwIfAborted();
    const claim = await (alert ? store.claimAlert : store.claim)(
      key,
      owner,
      endpoints.length,
      dbOptions,
    );
    const cached = (result) => ({ ...result, meta: { ...result.meta, fareCached: true } });
    if (claim.status === 'ready') return cached(claim.result);
    if (claim.status === 'limited')
      throw new SearchError(
        claim.code === 'daily_limit'
          ? 'The shared daily search limit has been reached. Cached searches still work.'
          : 'The free monthly search allowance has been used. Cached searches still work.',
        { status: 429, code: claim.code, resetAt: claim.resetAt },
      );
    if (claim.status === 'failed') throw cachedFailure(claim.result);
    if (claim.status === 'pending') {
      while (!signal.aborted) {
        await sleep(400, undefined, { signal });
        const fare = await store.getFare(key, dbOptions);
        if (fare?.state === 'ready' && Date.parse(fare.expires_at) > now())
          return cached(fare.result);
        if (fare?.state === 'failed' && Date.parse(fare.expires_at) > now())
          throw cachedFailure(fare.result);
        if (!fare || !(Date.parse(fare.expires_at) > now())) break;
      }
      throw new SearchError('This search could not finish. Please retry shortly.');
    }
    if (claim.status !== 'owner')
      throw new SearchError('Search storage returned an invalid reservation.', { status: 503 });
    try {
      const settled = await Promise.allSettled(
        endpoints.map(async (endpoint) => {
          signal.throwIfAborted();
          const data = await lookup(origin, endpoint, date, travelers, { signal });
          return normalizeOffers(data, { origin, destination, endpoint, date, travelers });
        }),
      );
      const succeeded = settled.filter((x) => x.status === 'fulfilled');
      if (!succeeded.length) throw settled[0].reason;
      const seen = new Set();
      const itineraries = succeeded
        .flatMap((x) => x.value)
        .sort((a, b) => a.price - b.price)
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      const result = {
        itineraries,
        meta: {
          requested: endpoints.length,
          succeeded: succeeded.length,
          failed: endpoints.length - succeeded.length,
          partial: succeeded.length < endpoints.length,
          ...(succeeded.length < endpoints.length
            ? { error: 'Some route checks failed. Retry in a minute.' }
            : {}),
          fareCached: false,
          pricedAt: new Date(now()).toISOString(),
          candidates: route.candidates,
          candidatesExpiresAt: route.expires_at,
          sourcePeriod: route.source_period,
        },
      };
      // Quota is already reserved. Auxiliary writes must not discard usable fares.
      const persistenceOptions = { signal: AbortSignal.timeout(2_000) };
      const saved = await store.finish(key, owner, result, false, persistenceOptions).catch(() => {
        console.warn('[search] fares could not be cached');
      });
      await store
        .observe(
          origin,
          destination,
          route.created_at,
          [...new Set(itineraries.filter((f) => f.isHiddenCity).map((f) => f.finalDestination))],
          persistenceOptions,
        )
        .catch(() => console.warn('[search] route observations could not be saved'));
      return saved || result;
    } catch (error) {
      const safe = publicError(error);
      await store
        .finish(
          key,
          owner,
          { message: safe.message, status: safe.status, code: safe.code, resetAt: safe.resetAt },
          true,
          { signal: AbortSignal.timeout(2_000) },
        )
        .catch(() => {});
      throw error;
    }
  };
}

export function searchOneWay(...args) {
  return createSearch({ store: getStore() })(...args);
}

export function searchAlertOneWay(...args) {
  return createSearch({ store: getStore(), alert: true })(...args);
}
