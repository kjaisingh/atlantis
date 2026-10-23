import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateSubscriber, validateTrip } from './validation.js';
import { SEARCH_TIMEOUT_MS } from './duffel.js';

const airports = readFileSync(new URL('./data/airports.txt', import.meta.url), 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const airportNames = JSON.parse(
  readFileSync(new URL('./data/airport-names.json', import.meta.url), 'utf-8'),
);
const lookupMap = JSON.parse(
  readFileSync(new URL('./data/lookup-map.json', import.meta.url), 'utf-8'),
);
const metroNames = JSON.parse(
  readFileSync(new URL('./data/metro-names.json', import.meta.url), 'utf-8'),
);

const airportDirectory = airports.map((code) => ({
  code,
  city: airportNames[code]?.city ?? null,
  name: airportNames[code]?.name ?? null,
}));
const metroDirectory = Object.entries(lookupMap).map(([code, members]) => ({
  code,
  city: metroNames[code]?.city ?? null,
  name: `All airports (${members.join(', ')})`,
}));
const searchableAirports = [...airportDirectory, ...metroDirectory];
const airportSet = new Set([...airports, ...Object.keys(lookupMap)]);

const searchLimiter = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many searches. Please wait a moment and try again.' },
  });
const subscribeLimiter = () =>
  rateLimit({
    windowMs: 3_600_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many subscription attempts. Please try again later.' },
  });

export function pinNonstopFirst(itineraries) {
  const index = itineraries.findIndex((itinerary) => itinerary.nonstop);
  if (index <= 0) return [...itineraries];
  return [itineraries[index], ...itineraries.slice(0, index), ...itineraries.slice(index + 1)];
}

export function selectResults(itineraries) {
  const currencies = new Set(itineraries.map((itinerary) => itinerary.currency));
  return [...currencies].flatMap((currency) =>
    pinNonstopFirst(itineraries.filter((itinerary) => itinerary.currency === currency)).slice(
      0,
      10,
    ),
  );
}

function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createRoutes({ config, database, jobRunner, searchFlights }) {
  const router = express.Router();

  router.get('/airports', (_request, response) => response.json(searchableAirports));

  router.post('/search', searchLimiter(), async (request, response) => {
    if (!config.duffelConfigured) {
      response.status(503).json({ error: 'Flight search is not configured.' });
      return;
    }

    const trip = validateTrip(request.body ?? {}, airportSet);
    if (trip.error) {
      response.status(400).json({ error: trip.error });
      return;
    }

    const { origin, destination, departureDate, returnDate, travelers } = trip.value;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]);
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on('close', onClose);
    try {
      const searches = [searchFlights(origin, destination, departureDate, travelers, { signal })];
      if (returnDate)
        searches.push(searchFlights(destination, origin, returnDate, travelers, { signal }));
      const legs = await Promise.allSettled(searches);
      if (legs.every((leg) => leg.status === 'rejected')) {
        throw new AggregateError(
          legs.map((leg) => leg.reason),
          'All flight searches failed.',
        );
      }
      const result = { meta: {} };
      legs.forEach((leg, index) => {
        const direction = index === 0 ? 'outbound' : 'inbound';
        if (leg.status === 'fulfilled') {
          result[direction] = selectResults(leg.value.itineraries);
          result.meta[direction] = {
            ...leg.value.meta,
            available: leg.value.itineraries.length,
            returned: result[direction].length,
          };
        } else {
          result[direction] = [];
          result.meta[direction] = {
            partial: true,
            error: 'This direction could not be checked. Please retry your search.',
          };
        }
      });
      if (response.destroyed) return;
      response.json(result);
    } catch (error) {
      console.error('[routes] search failed:', error.message);
      response.status(502).json({ error: 'Flight search failed. Please try again shortly.' });
    } finally {
      response.off('close', onClose);
    }
  });

  router.post('/subscribe', subscribeLimiter(), async (request, response) => {
    if (!config.subscriptionsEnabled || !database.isEnabled()) {
      response.status(503).json({ error: 'Price alerts are not currently available.' });
      return;
    }
    const trip = validateTrip(request.body ?? {}, airportSet);
    if (trip.error) {
      response.status(400).json({ error: trip.error });
      return;
    }
    const subscriber = validateSubscriber(request.body ?? {});
    if (subscriber.error) {
      response.status(400).json({ error: subscriber.error });
      return;
    }

    const subscription = await database.addSubscription({
      name: subscriber.value.name,
      email: subscriber.value.email,
      origin: trip.value.origin,
      destination: trip.value.destination,
      departure_date: trip.value.departureDate,
      return_date: trip.value.returnDate || null,
      num_travelers: trip.value.travelers,
      price_threshold: subscriber.value.priceThreshold,
      currency: subscriber.value.currency,
    });

    response.status(201).json({
      id: subscription.id,
      createdAt: subscription.created_at,
      message: 'Price alert created.',
    });
  });

  router.post('/jobs/check-subscriptions', async (request, response) => {
    if (!secretMatches(request.headers['x-job-secret'], process.env.JOB_SECRET)) {
      response.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    if (!config.subscriptionsEnabled || !database.isEnabled()) {
      response.status(503).json({ error: 'Price alerts are not configured.' });
      return;
    }
    try {
      response.json(await jobRunner.checkSubscriptions());
    } catch (error) {
      console.error('[routes] check-subscriptions failed:', error.message);
      response.status(500).json({ error: 'Subscription check failed.' });
    }
  });

  return router;
}
