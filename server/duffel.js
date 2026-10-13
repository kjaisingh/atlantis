const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests?return_offers=true';
const DUFFEL_VERSION = 'v2';
const MAX_RETRIES = 3;
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 2_000_000;

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

function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reserveRateBudget() {
  let release;
  const previous = budgetTail;
  budgetTail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    if (rateState.remaining !== null && rateState.remaining <= 0 && rateState.resetAt) {
      const wait = Math.max(rateState.resetAt - Date.now(), 0) + 250;
      if (wait > 0) {
        console.warn(`[duffel] rate budget exhausted; waiting ${wait}ms.`);
        await sleep(wait);
      }
      rateState.remaining = rateState.limit;
    }
    if (rateState.remaining !== null) rateState.remaining -= 1;
  } finally {
    release();
  }
}

async function parseResponse(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new DuffelError('Duffel response exceeded the allowed size.');
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new DuffelError('Duffel response exceeded the allowed size.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new DuffelError('Duffel returned an invalid response.', {
      status: response.status,
      retryable: response.status >= 500,
    });
  }
}

async function postOffers(slices, passengers) {
  const apiKey = process.env.DUFFEL_API_KEY;
  if (!apiKey) throw new DuffelError('DUFFEL_API_KEY is not configured.');

  await reserveRateBudget();
  await acquireSlot();
  try {
    const response = await fetch(DUFFEL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequest(slices, passengers)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

async function requestOffers(slices, passengers) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await postOffers(slices, passengers);
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === MAX_RETRIES) break;
      const resetDelay = rateState.resetAt ? Math.max(rateState.resetAt - Date.now(), 0) : 0;
      const backoff = Math.max(resetDelay, 500 * 2 ** attempt) + Math.random() * 250;
      console.warn(`[duffel] transient failure; retrying in ${Math.round(backoff)}ms.`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

export function oneWayLookup(origin, destination, departureDate, passengers) {
  return requestOffers([{ origin, destination, departure_date: departureDate }], passengers);
}
