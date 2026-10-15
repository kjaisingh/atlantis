import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateSubscriber, validateTrip } from './validation.js';

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

const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many searches. Please wait a moment and try again.' },
});
const subscribeLimiter = rateLimit({
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

  router.post('/search', searchLimiter, async (request, response) => {
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
    try {
      const [outbound, inbound] = await Promise.all([
        searchFlights(origin, destination, departureDate, travelers),
        returnDate ? searchFlights(destination, origin, returnDate, travelers) : null,
      ]);
      const result = {
        outbound: pinNonstopFirst(outbound.itineraries).slice(0, 10),
        meta: { outbound: outbound.meta },
      };
      if (inbound) {
        result.inbound = pinNonstopFirst(inbound.itineraries).slice(0, 10);
        result.meta.inbound = inbound.meta;
      }
      response.json(result);
    } catch (error) {
      console.error('[routes] search failed:', error.message);
      response.status(502).json({ error: 'Flight search failed. Please try again shortly.' });
    }
  });

  router.post('/subscribe', subscribeLimiter, async (request, response) => {
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
