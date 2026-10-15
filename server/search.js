import { readFileSync } from 'node:fs';
import * as duffelClient from './duffel.js';

const cacheTable = JSON.parse(readFileSync(new URL('./data/cache-table.json', import.meta.url)));
const lookupMap = JSON.parse(readFileSync(new URL('./data/lookup-map.json', import.meta.url)));
const cacheIndex = new Map(cacheTable.map((entry) => [`${entry.X}:${entry.Y}`, entry.Z]));
export const MAX_FANOUT_REQUESTS = 4;

export function planRequests(origin, destination, limit = MAX_FANOUT_REQUESTS) {
  const origins = lookupMap[origin] ?? [origin];
  const destinations = lookupMap[destination] ?? [destination];
  const direct = [];
  const hidden = [];

  for (const from of origins) {
    for (const to of destinations) {
      direct.push({ origin: from, candidate: to, kind: 'direct' });
      for (const candidate of cacheIndex.get(`${from}:${to}`) ?? []) {
        if (candidate !== from && !destinations.includes(candidate)) {
          hidden.push({ origin: from, candidate, kind: 'hidden-city' });
        }
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (const request of [...direct, ...hidden]) {
    const key = `${request.origin}:${request.candidate}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(request);
    }
  }

  return {
    requests: unique.slice(0, limit),
    totalCandidates: unique.length,
    truncated: unique.length > limit,
  };
}

export async function fetchData(requests, departureDate, numAdults) {
  const settled = await Promise.allSettled(
    requests.map((request) =>
      duffelClient.oneWayLookup(request.origin, request.candidate, departureDate, numAdults),
    ),
  );
  const fulfilled = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') fulfilled.push(result.value);
    else {
      errors.push({ request: requests[index], message: result.reason?.message ?? 'Unknown error' });
      console.error('[search] fan-out request failed:', result.reason?.message ?? result.reason);
    }
  });
  if (requests.length > 0 && fulfilled.length === 0) {
    throw new AggregateError(
      settled.filter((result) => result.status === 'rejected').map((result) => result.reason),
      'Every Duffel fan-out request failed.',
    );
  }
  return { fulfilled, errors };
}

export async function searchOneWay(origin, destination, date, numAdults) {
  const plan = planRequests(origin, destination);
  const { fulfilled, errors } = await fetchData(plan.requests, date, numAdults);
  const offers = fulfilled.flatMap((result) => filterJSONResult(result.offers, destination));
  const normalized = offers.map((offer) => OneWayFilterItems(offer, 0));
  normalized.sort((left, right) =>
    left.currency === right.currency
      ? Number(left.price) - Number(right.price)
      : left.currency.localeCompare(right.currency),
  );
  return {
    itineraries: filterData(normalized, numAdults, destination),
    meta: {
      requested: plan.requests.length,
      succeeded: fulfilled.length,
      failed: errors.length,
      truncated: plan.truncated,
      totalCandidates: plan.totalCandidates,
      partial: errors.length > 0 || plan.truncated,
    },
  };
}

export async function findAllOneWayFlights(origin, destination, date, numAdults) {
  return (await searchOneWay(origin, destination, date, numAdults)).itineraries;
}

export function filterData(itineraries, numAdults, destination) {
  const results = [];
  const seenFlights = new Set();
  const destinationCodes = lookupMap[destination] ?? [destination];

  for (const itinerary of itineraries) {
    if (!Array.isArray(itinerary.segments) || itinerary.segments.length === 0) continue;
    const flightKey = itinerary.segments
      .map(
        (segment) =>
          `${segment.origin}-${segment.destination}:${segment.carrierCode}${segment.flightNumber}:${segment.departureTime}`,
      )
      .join('|');
    if (seenFlights.has(flightKey)) continue;
    seenFlights.add(flightKey);

    const path = [itinerary.segments[0].origin];
    const layovers = [];
    let destinationIndex = -1;
    itinerary.segments.forEach((segment, index) => {
      if (index < itinerary.segments.length - 1) layovers.push(segment.destination);
      if (destinationCodes.includes(segment.destination)) destinationIndex = index;
      path.push(segment.destination);
    });
    if (destinationIndex === -1) continue;

    const finalDestination = itinerary.segments.at(-1).destination;
    const isHiddenCity = !destinationCodes.includes(finalDestination);
    results.push({
      airline: itinerary.segments[0].carrierName,
      path: path.join(' → '),
      price: itinerary.price,
      currency: itinerary.currency,
      duration: itinerary.totalDuration,
      isHiddenCity,
      layoverCity: isHiddenCity ? destination : null,
      nonstop: itinerary.segments.length === 1,
      bookingLink: getBookingLink(
        itinerary.segments[0].origin,
        finalDestination,
        itinerary.segments[0].departureTime.substring(0, 10),
        itinerary.segments[0].carrierCode,
        layovers,
        numAdults,
      ),
      departureTime: itinerary.segments[0].departureTime,
      arrivalTime: itinerary.segments[destinationIndex].arrivalTime,
    });
  }
  return results;
}

export function getBookingLink(source, destination, date, airline, layovers, numAdults) {
  const route = `${encodeURIComponent(source)}-${encodeURIComponent(destination)}/${encodeURIComponent(date)}/${encodeURIComponent(`${numAdults}adults`)}`;
  const filters = `airlines=~${airline};stops=~${layovers.length};layoverair=${layovers.join(',')}`;
  return `https://www.kayak.com/flights/${route}?sort=price_a&fs=${encodeURIComponent(filters)}`;
}

export function OneWayFilterItems(offer, sliceIndex) {
  const slice = offer.slices[sliceIndex];
  return {
    price: offer.total_amount,
    currency: offer.total_currency,
    fareType: slice.fare_brand_name,
    totalDuration: slice.duration,
    segments: slice.segments.map((segment) => ({
      origin: segment.origin.iata_code,
      destination: segment.destination.iata_code,
      flightNumber: segment.marketing_carrier_flight_number,
      carrierCode: segment.marketing_carrier.iata_code,
      carrierName: segment.marketing_carrier.name,
      departureTime: segment.departing_at,
      arrivalTime: segment.arriving_at,
      duration: segment.duration,
    })),
  };
}

export function filterJSONResult(offers, destination) {
  const destinationCodes = lookupMap[destination] ?? [destination];
  if (!Array.isArray(offers)) return [];
  return offers.filter((offer) => {
    const segments = offer?.slices?.[0]?.segments;
    return (
      Number.isFinite(Number(offer?.total_amount)) &&
      Number(offer.total_amount) > 0 &&
      /^[A-Z]{3}$/.test(offer?.total_currency ?? '') &&
      Array.isArray(segments) &&
      segments.length > 0 &&
      segments.every(
        (segment) =>
          typeof segment?.origin?.iata_code === 'string' &&
          typeof segment?.destination?.iata_code === 'string' &&
          typeof segment?.marketing_carrier?.iata_code === 'string' &&
          typeof segment?.marketing_carrier?.name === 'string' &&
          typeof segment?.departing_at === 'string' &&
          typeof segment?.arriving_at === 'string',
      ) &&
      segments.some((segment) => destinationCodes.includes(segment.destination.iata_code))
    );
  });
}
