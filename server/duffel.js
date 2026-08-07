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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOffers(slices, passengers, attempt = 0) {
  try {
    const response = await axios.post(DUFFEL_API_URL, buildRequest(slices, passengers), {
      headers: {
        Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
      },
      params: { return_offers: true },
    });
    return response.data.data;
  } catch (err) {
    const isRateLimited = err.response?.status === 429;
    if (!isRateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw err;
    }
    const reset = Date.parse(err.response.headers['ratelimit-reset']);
    const delayMs = Number.isNaN(reset) ? 2000 : Math.max(reset - Date.now(), 0) + 250;
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

export function roundTripLookup(origin, destination, departureDate, returnDate, passengers) {
  return requestOffers(
    [
      { origin, destination, departure_date: departureDate },
      { origin: destination, destination: origin, departure_date: returnDate },
    ],
    passengers,
  );
}
