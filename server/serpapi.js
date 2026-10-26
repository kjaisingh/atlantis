import { SearchError } from './errors.js';
import { airportCodes } from './route-graph.js';

export const SEARCH_TIMEOUT_MS = 55_000;
const MAX_BYTES = 5_000_000;

export function requestUrl(origin, destination, date, adults, key) {
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({
    engine: 'google_flights',
    type: '2',
    departure_id: airportCodes(origin).join(','),
    arrival_id: airportCodes(destination).join(','),
    outbound_date: date,
    adults: String(adults),
    travel_class: '1',
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    show_hidden: 'true',
    api_key: key,
  }).toString();
  return url;
}

export async function oneWayLookup(
  origin,
  destination,
  date,
  adults,
  { signal, fetcher = fetch, key = process.env.SERPAPI_API_KEY } = {},
) {
  if (!key) throw new SearchError('Flight search is not configured.', { status: 503 });
  const deadline = AbortSignal.timeout(40_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await fetcher(requestUrl(origin, destination, date, adults, key), {
      signal: combined,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SearchError(
        response.status === 429
          ? 'The free fare provider quota is exhausted. Please try again later.'
          : 'The fare provider is unavailable. Please try again later.',
        { status: response.status === 429 ? 429 : 502 },
      );
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new SearchError('The fare provider response is too large.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new SearchError('The fare provider response is too large.');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // No-flight responses can contain an error string despite a successful search.
    if (data.search_metadata?.status !== 'Success')
      throw new SearchError('The fare provider could not complete this search.');
    return data;
  } catch (error) {
    if (error instanceof SearchError) throw error;
    throw new SearchError(
      combined.aborted
        ? 'Flight search timed out. Please try again.'
        : 'The fare provider returned an unusable response.',
    );
  }
}

function bookingLink(data, origin, finalDestination, date, travelers) {
  try {
    const url = new URL(data.search_metadata?.google_flights_url);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'www.google.com' &&
      url.pathname.startsWith('/travel/flights')
    )
      return url.href;
  } catch {
    /* Use a new search if the provider omits its link. */
  }
  return `https://www.google.com/travel/flights?hl=en&q=${encodeURIComponent(`Flights from ${origin} to ${finalDestination} on ${date} one way ${travelers} adults economy`)}`;
}

const codePattern = /^[A-Z]{3}$/;
const timePattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/;

function validTime(value) {
  if (typeof value !== 'string' || !timePattern.test(value)) return false;
  const normalized = value.replace(' ', 'T');
  const full = normalized.length === 16 ? `${normalized}:00` : normalized;
  const date = new Date(`${full}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === full;
}

export function normalizeOffers(data, { origin, destination, endpoint, date, travelers }) {
  const origins = airportCodes(origin);
  const exits = airportCodes(destination);
  const endpoints = airportCodes(endpoint);
  const offers = [
    ...(Array.isArray(data.best_flights) ? data.best_flights : []),
    ...(Array.isArray(data.other_flights) ? data.other_flights : []),
  ];
  return offers.flatMap((offer) => {
    const flights = offer?.flights;
    if (
      !Array.isArray(flights) ||
      !flights.length ||
      typeof offer.price !== 'number' ||
      !Number.isFinite(offer.price) ||
      offer.price <= 0
    )
      return [];
    if (
      !flights.every(
        (f) =>
          codePattern.test(f?.departure_airport?.id ?? '') &&
          codePattern.test(f?.arrival_airport?.id ?? '') &&
          validTime(f?.departure_airport?.time) &&
          validTime(f?.arrival_airport?.time) &&
          typeof f.flight_number === 'string' &&
          f.flight_number.trim() !== '' &&
          typeof f.airline === 'string' &&
          f.airline.trim() !== '',
      )
    )
      return [];
    if (
      !origins.includes(flights[0].departure_airport.id) ||
      !flights[0].departure_airport.time.startsWith(date)
    )
      return [];
    if (
      flights.some((f, i) => i > 0 && flights[i - 1].arrival_airport.id !== f.departure_airport.id)
    )
      return [];
    const finalDestination = flights.at(-1).arrival_airport.id;
    if (!endpoints.includes(finalDestination)) return [];
    const exitIndex = flights.findIndex((f) => exits.includes(f.arrival_airport.id));
    if (exitIndex < 0) return [];
    const isHiddenCity = !exits.includes(finalDestination);
    if (isHiddenCity && exitIndex === flights.length - 1) return [];
    const segments = flights.map((f) => ({
      origin: f.departure_airport.id,
      destination: f.arrival_airport.id,
      departureTime: f.departure_airport.time.replace(' ', 'T'),
      arrivalTime: f.arrival_airport.time.replace(' ', 'T'),
      flightNumber: f.flight_number,
      airline: f.airline,
    }));
    const path = [segments[0].origin, ...segments.map((f) => f.destination)];
    return [
      {
        id: segments
          .map((f) => `${f.origin}-${f.destination}:${f.flightNumber}:${f.departureTime}`)
          .join('|'),
        airline: [...new Set(flights.map((f) => f.airline))].join(' / '),
        path: path.join(' → '),
        price: offer.price,
        currency: 'USD',
        duration: Number.isFinite(offer.total_duration) ? `PT${offer.total_duration}M` : null,
        segments,
        finalDestination,
        isHiddenCity,
        layoverCity: isHiddenCity ? segments[exitIndex].destination : null,
        nonstop: segments.length === 1,
        departureTime: segments[0].departureTime,
        arrivalTime: segments[exitIndex].arrivalTime,
        bookingLink: bookingLink(data, segments[0].origin, finalDestination, date, travelers),
      },
    ];
  });
}
