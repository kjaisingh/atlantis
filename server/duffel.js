const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests?return_offers=true';
const DUFFEL_VERSION = 'v2';
const MAX_RETRIES = 3;
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 2_000_000;
export const SEARCH_TIMEOUT_MS = 55_000;

let activeRequests = 0;
const waiters = [];
const rateState = { limit: null, remaining: null, resetAt: null };
let budgetTail = Promise.resolve();

export class DuffelError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'DuffelError';
    this.status = status;
    this.retryable = retryable;
  }
}

function buildRequest(slices, passengers) {
  return {
    data: {
      slices,
      passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
      cabin_class: 'economy',
    },
  };
}

function acquireSlot(signal) {
  signal.throwIfAborted();
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const waiter = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      waiters.splice(waiters.indexOf(waiter), 1);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    waiters.push(waiter);
  });
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else activeRequests -= 1;
}

function updateRateState(headers) {
  const limitHeader = headers.get('ratelimit-limit');
  const remainingHeader = headers.get('ratelimit-remaining');
  const resetHeader = headers.get('ratelimit-reset');
  const limit = limitHeader === null ? Number.NaN : Number(limitHeader);
  const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
  const resetAt = resetHeader === null ? Number.NaN : Date.parse(resetHeader);
  if (Number.isFinite(limit)) rateState.limit = limit;
  if (Number.isFinite(remaining)) rateState.remaining = remaining;
  if (Number.isFinite(resetAt)) rateState.resetAt = resetAt;
}

async function reserveRateBudget(signal) {
  let release;
  const previous = budgetTail;
  const reservation = new Promise((resolve) => {
    release = resolve;
  });
  budgetTail = previous.then(() => reservation);
  try {
    await waitForBudget(previous, signal);
    signal.throwIfAborted();
    if (rateState.remaining !== null && rateState.remaining <= 0 && rateState.resetAt) {
      const wait = Math.max(rateState.resetAt - Date.now(), 0) + 250;
      if (wait > 0) {
        console.warn(`[duffel] rate budget exhausted; waiting ${wait}ms.`);
        await sleep(wait, undefined, { signal });
      }
      rateState.remaining = rateState.limit;
    }
    if (rateState.remaining !== null) rateState.remaining -= 1;
  } finally {
    release();
  }
}

function waitForBudget(previous, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    previous.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

async function parseResponse(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new DuffelError('Duffel response exceeded the allowed size.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES)
      throw new DuffelError('Duffel response exceeded the allowed size.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DuffelError('Duffel returned an invalid response.', {
      status: response.status,
      retryable: response.status >= 500,
    });
  }
}

async function postOffers(slices, passengers, signal) {
  const apiKey = process.env.DUFFEL_API_KEY;
  if (!apiKey) throw new DuffelError('DUFFEL_API_KEY is not configured.');

  await acquireSlot(signal);
  try {
    await reserveRateBudget(signal);
    signal.throwIfAborted();
    const response = await fetch(DUFFEL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequest(slices, passengers)),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    updateRateState(response.headers);
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new DuffelError(`Duffel request failed with status ${response.status}.`, {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    if (!body?.data || !Array.isArray(body.data.offers)) {
      throw new DuffelError('Duffel response did not contain offers.');
    }
    return body.data;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new DuffelError('Duffel request timed out.', { retryable: true });
    }
    if (error instanceof TypeError) {
      throw new DuffelError('Duffel could not be reached.', { retryable: true });
    }
    throw error;
  } finally {
    releaseSlot();
  }
}

async function requestOffers(slices, passengers, { signal: callerSignal } = {}) {
  const deadline = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await postOffers(slices, passengers, signal);
    } catch (error) {
      lastError = error;
      if (signal.aborted || !error.retryable || attempt === MAX_RETRIES) break;
      const resetDelay = rateState.resetAt ? Math.max(rateState.resetAt - Date.now(), 0) : 0;
      const backoff = Math.max(resetDelay, 500 * 2 ** attempt) + Math.random() * 250;
      console.warn(`[duffel] transient failure; retrying in ${Math.round(backoff)}ms.`);
      await sleep(backoff, undefined, { signal });
    }
  }
  throw lastError;
}

export function oneWayLookup(origin, destination, departureDate, passengers, options) {
  return requestOffers(
    [{ origin, destination, departure_date: departureDate }],
    passengers,
    options,
  );
}
import { setTimeout as sleep } from 'node:timers/promises';
