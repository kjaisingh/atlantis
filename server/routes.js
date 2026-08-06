import { readFileSync } from 'node:fs';
import express from 'express';
import * as db from './db.js';
import * as jobs from './jobs.js';
import { findAllOneWayFlights } from './search.js';

const router = express.Router();

const airports = readFileSync(new URL('./data/airports.txt', import.meta.url), 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const airportSet = new Set(airports);

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

router.get('/airports', (_req, res) => {
  res.json(airports);
});

router.post('/search', async (req, res) => {
  const { origin, destination, departureDate, returnDate, travelers } = req.body;
  const numTravelers = Number(travelers);

  if (!airportSet.has(origin) || !airportSet.has(destination)) {
    return res.status(400).json({ error: 'Unknown origin or destination airport code.' });
  }
  if (origin === destination) {
    return res.status(400).json({ error: 'Origin and destination must differ.' });
  }
  if (!isValidDate(departureDate)) {
    return res.status(400).json({ error: 'Departure date must be a valid, non-past date.' });
  }
  if (returnDate && !isValidDate(returnDate)) {
    return res.status(400).json({ error: 'Return date must be a valid, non-past date.' });
  }
  if (!Number.isInteger(numTravelers) || numTravelers < 1 || numTravelers > 9) {
    return res.status(400).json({ error: 'Travelers must be an integer between 1 and 9.' });
  }

  try {
    const outbound = await findAllOneWayFlights(origin, destination, departureDate, numTravelers);
    const response = { outbound: outbound.slice(0, 10) };

    if (returnDate) {
      const inbound = await findAllOneWayFlights(destination, origin, returnDate, numTravelers);
      response.inbound = inbound.slice(0, 10);
    }

    res.json(response);
  } catch (err) {
    console.error('[routes] search failed:', err.message);
    res.status(502).json({ error: 'Flight search failed. Please try again shortly.' });
  }
});

router.post('/subscribe', async (req, res) => {
  if (!db.isEnabled()) {
    return res.status(503).json({ error: db.getConfigError() });
  }

  const {
    name,
    email,
    origin,
    destination,
    departureDate,
    returnDate,
    travelers,
    priceThreshold,
  } = req.body;
  const numTravelers = Number(travelers);
  const threshold = Number(priceThreshold);

  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid name and email are required.' });
  }
  if (!airportSet.has(origin) || !airportSet.has(destination)) {
    return res.status(400).json({ error: 'Unknown origin or destination airport code.' });
  }
  if (!isValidDate(departureDate)) {
    return res.status(400).json({ error: 'Departure date must be a valid, non-past date.' });
  }
  if (returnDate && !isValidDate(returnDate)) {
    return res.status(400).json({ error: 'Return date must be a valid, non-past date.' });
  }
  if (!Number.isInteger(numTravelers) || numTravelers < 1 || numTravelers > 9) {
    return res.status(400).json({ error: 'Travelers must be an integer between 1 and 9.' });
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return res.status(400).json({ error: 'Price threshold must be a positive number.' });
  }

  const subscription = await db.addSubscription({
    name,
    email,
    origin,
    destination,
    departure_date: departureDate,
    return_date: returnDate || null,
    num_travelers: numTravelers,
    price_threshold: threshold,
  });

  if (!subscription) {
    return res.status(502).json({ error: 'Could not save subscription. Please try again shortly.' });
  }

  res.status(201).json(subscription);
});

router.post('/jobs/check-subscriptions', async (req, res) => {
  const secret = process.env.JOB_SECRET;
  if (!secret || req.headers['x-job-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const result = await jobs.checkSubscriptions();
  res.json(result);
});

export default router;
