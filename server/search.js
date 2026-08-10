import { readFileSync } from 'node:fs';
import * as duffelClient from './duffel.js';

const cacheTable = JSON.parse(readFileSync(new URL('./data/cache-table.json', import.meta.url)));
const lookupMap = JSON.parse(readFileSync(new URL('./data/lookup-map.json', import.meta.url)));

// Cache-table rows have up to 9 hidden-city candidates; uncapped, one direction alone
// could need 10 Duffel requests (this account's whole rate-limit window) before a round
// trip's other direction fires a single request. Capping keeps a full round trip (both
// directions) comfortably under the 10-request budget without a wait in the common case.
const MAX_FANOUT_CANDIDATES = 4;

/**
 * Returns one-way itineraries for origin -> dest, cheapest first.
 * origin/dest may be a metro code (lookup-map.json) covering several airports.
 * Fans out across concrete-airport pairs and their cached hidden-city
 * candidates (if any), then filters each search down to itineraries that
 * actually pass through dest (or one of its metro members) as a layover.
 */
export async function findAllOneWayFlights(origin, dest, date, numAdults) {
  const originAirports = lookupMap[origin] ?? [origin];
  const destAirports = lookupMap[dest] ?? [dest];

  // Pass 1: a direct request for every concrete origin/dest pair, so a metro
  // search always covers every member airport at least once.
  const requests = [];
  for (const o of originAirports) {
    for (const d of destAirports) {
      requests.push({ origin: o, candidate: d });
    }
  }
  // Pass 2: fill any remaining budget with each pair's cached hidden-city candidates.
  for (const o of originAirports) {
    for (const d of destAirports) {
      const cacheRow = cacheTable.find((entry) => entry.X === o && entry.Y === d);
      if (!cacheRow) continue;
      const zCandidates = cacheRow.Z.filter((z) => z !== o && !destAirports.includes(z));
      for (const z of zCandidates) {
        requests.push({ origin: o, candidate: z });
      }
    }
  }

  const resultsList = await fetchData(requests.slice(0, MAX_FANOUT_CANDIDATES), date, numAdults);

  let offers = [];
  for (const offerRequest of resultsList) {
    offers = offers.concat(filterJSONResult(offerRequest.offers, dest));
  }

  let itineraries = offers.map((offer) => OneWayFilterItems(offer, 0));
  itineraries.sort((a, b) => a.price - b.price);
  itineraries = filterData(itineraries, numAdults, dest);
  return itineraries;
}

export async function fetchData(requests, departureDate, numAdults) {
  const results = await Promise.allSettled(
    requests.map((r) => duffelClient.oneWayLookup(r.origin, r.candidate, departureDate, numAdults)),
  );
  return results
    .filter((result) => {
      if (result.status === 'rejected') {
        console.error('[search] fan-out request failed:', result.reason?.message ?? result.reason);
      }
      return result.status === 'fulfilled';
    })
    .map((result) => result.value);
}

/**
 * Normalizes filtered offers into flat itinerary summaries: airline, human
 * path, price, booking link, and the local departure/arrival time at dest
 * (dest may be a mid-itinerary layover, not the final ticketed stop).
 */
export function filterData(itineraries, numAdults, dest) {
  const results = [];
  const seenFlights = new Set();
  let directPutOnTop = false;
  const cities = lookupMap[dest] ?? [dest];

  for (const itinerary of itineraries) {
    const segments = itinerary.segments;

    // Same physical flight(s) often reappear as several fare brands (basic/main/refundable) at
    // different prices. Itineraries arrive price-sorted, so the first occurrence is the cheapest.
    const flightKey = segments.map((s) => `${s.carrierCode}${s.flightNumber}`).join('-');
    if (seenFlights.has(flightKey)) {
      continue;
    }
    seenFlights.add(flightKey);

    const path = [segments[0].origin];
    const layovers = [];
    let destIndex = -1;

    for (let i = 0; i < segments.length; i += 1) {
      if (i < segments.length - 1) {
        layovers.push(segments[i].destination);
      }
      if (cities.includes(segments[i].destination)) {
        destIndex = i;
      }
      path.push(segments[i].destination);
    }

    if (destIndex === -1) {
      continue;
    }

    const dateFormat = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    };

    const isHiddenCity = !cities.includes(segments[segments.length - 1].destination);

    const entry = {
      airline: segments[0].carrierName,
      path: path.join(' → '),
      price: itinerary.price,
      isHiddenCity,
      layoverCity: isHiddenCity ? dest : null,
      bookingLink: getBookingLink(
        segments[0].origin,
        segments[segments.length - 1].destination,
        segments[0].departureTime.substring(0, 10),
        segments[0].carrierCode,
        layovers,
        numAdults,
      ),
      departureTime: new Date(segments[0].departureTime).toLocaleString('en-US', dateFormat),
      arrivalTime: new Date(segments[destIndex].arrivalTime).toLocaleString('en-US', dateFormat),
    };

    if (!directPutOnTop && cities.includes(segments[segments.length - 1].destination)) {
      results.unshift(entry);
      directPutOnTop = true;
    } else {
      results.push(entry);
    }
  }

  return results;
}

export function getBookingLink(source, dest, date, airline, layovers, numAdults) {
  const layoverString = layovers.join(',');
  return `https://www.kayak.com/flights/${source}-${dest}/${date}/${numAdults}adults?sort=price_a&fs=airlines=~${airline};stops=~${layovers.length};layoverair=${layoverString}`;
}

/** Flattens one slice of a Duffel offer into the fields the app cares about. */
export function OneWayFilterItems(offer, sliceIndex) {
  const slice = offer.slices[sliceIndex];
  return {
    price: offer.total_amount,
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

/** Keeps only offers whose first slice actually routes through dest (or one of its metro members). */
export function filterJSONResult(offers, dest) {
  const cities = lookupMap[dest] ?? [dest];
  return offers.filter((offer) =>
    offer.slices[0].segments.some((segment) => cities.includes(segment.destination.iata_code)),
  );
}
