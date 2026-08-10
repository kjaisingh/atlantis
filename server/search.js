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
 * Fans out across the cached hidden-city candidates for this pair (if any),
 * then filters each fan-out search down to itineraries that actually pass
 * through dest as a layover.
 */
export async function findAllOneWayFlights(origin, dest, date, numAdults) {
  const cacheRow = cacheTable.find((entry) => entry.X === origin && entry.Y === dest);

  let offers = [];

  if (cacheRow) {
    const zCandidates = cacheRow.Z.filter((z) => z !== origin && z !== dest).slice(0, MAX_FANOUT_CANDIDATES - 1);
    const candidates = [...zCandidates, dest];
    const resultsList = await fetchData(origin, candidates, date, numAdults);
    for (const offerRequest of resultsList) {
      offers = offers.concat(filterJSONResult(offerRequest.offers, dest));
    }
  } else {
    const directSearch = await duffelClient.oneWayLookup(origin, dest, date, numAdults);
    offers = offers.concat(directSearch.offers);
  }

  let itineraries = offers.map((offer) => OneWayFilterItems(offer, 0));
  itineraries.sort((a, b) => a.price - b.price);
  itineraries = filterData(itineraries, numAdults, dest);
  return itineraries;
}

export async function fetchData(origin, zArray, departureDate, numAdults) {
  const results = await Promise.allSettled(
    zArray.map((z) => duffelClient.oneWayLookup(origin, z, departureDate, numAdults)),
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
  let directPutOnTop = false;
  const cities = lookupMap[dest] ?? [dest];

  for (const itinerary of itineraries) {
    const segments = itinerary.segments;
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

    const isHiddenCity = segments[segments.length - 1].destination !== dest;

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

    if (!directPutOnTop && segments[segments.length - 1].destination === dest) {
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

/** Keeps only offers whose first slice actually routes through dest. */
export function filterJSONResult(offers, dest) {
  return offers.filter((offer) =>
    offer.slices[0].segments.some((segment) => segment.destination.iata_code === dest),
  );
}
