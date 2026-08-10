import axios from 'axios';

const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests';
const DUFFEL_VERSION = 'v2';

function buildRequest(slices, passengers) {
  return {
    data: {
      slices,
      passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
      cabin_class: 'economy',
    },
  };
}

const MAX_RATE_LIMIT_RETRIES = 3;

// Caps concurrent in-flight requests across the whole process - shared by every
// caller (outbound fan-out, inbound fan-out, direct lookups) so a round trip's
// two directions can't each open their own pool on top of the other.
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;
const waiters = [];

function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    next();
  } else {
    activeRequests -= 1;
  }
}

// Duffel enforces a fixed-window request budget (this account: 10 per window,
// reported via the ratelimit-* headers) rather than a concurrency cap - a burst
// of ~12 requests from a round trip blows the budget no matter how it's paced
// unless we track remaining budget ourselves and pause before it hits zero.
const rateState = { limit: null, remaining: null, resetAt: null };

function updateRateState(headers) {
  const limit = Number(headers?.['ratelimit-limit']);
  const remaining = Number(headers?.['ratelimit-remaining']);
  const resetAt = Date.parse(headers?.['ratelimit-reset']);
  if (!Number.isNaN(limit)) rateState.limit = limit;
  if (!Number.isNaN(remaining)) rateState.remaining = remaining;
  if (!Number.isNaN(resetAt)) rateState.resetAt = resetAt;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateBudget() {
  if (rateState.remaining !== null && rateState.remaining <= 0 && rateState.resetAt) {
    const wait = Math.max(rateState.resetAt - Date.now(), 0) + 250;
    if (wait > 0) {
      console.warn(`[duffel] rate budget exhausted, waiting ${wait}ms for window reset`);
      await sleep(wait);
    }
    rateState.remaining = rateState.limit;
  }
}

async function postOffers(slices, passengers) {
  await acquireSlot();
  try {
    await waitForRateBudget();
    if (rateState.remaining !== null) rateState.remaining -= 1;
    const response = await axios.post(DUFFEL_API_URL, buildRequest(slices, passengers), {
      headers: {
        Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
      },
      params: { return_offers: true },
    });
    updateRateState(response.headers);
    return response.data.data;
  } catch (err) {
    if (err.response) updateRateState(err.response.headers);
    throw err;
  } finally {
    releaseSlot();
  }
}

async function requestOffers(slices, passengers, attempt = 0) {
  try {
    return await postOffers(slices, passengers);
  } catch (err) {
    const isRateLimited = err.response?.status === 429;
    if (!isRateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw err;
    }
    const reset = Date.parse(err.response.headers['ratelimit-reset']);
    const jitter = Math.random() * 500;
    const delayMs = (Number.isNaN(reset) ? 2000 : Math.max(reset - Date.now(), 0) + 250) + jitter;
    console.warn(`[duffel] rate limited (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}), retrying in ${delayMs}ms`);
    await sleep(delayMs);
    return requestOffers(slices, passengers, attempt + 1);
  }
}

export function oneWayLookup(origin, destination, departureDate, passengers) {
  return requestOffers(
    [{ origin, destination, departure_date: departureDate }],
    passengers,
  );
}
