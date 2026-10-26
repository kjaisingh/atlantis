import { readFileSync } from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateTrip } from './validation.js';
import { SEARCH_TIMEOUT_MS } from './serpapi.js';
import { publicError } from './errors.js';

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(`./data/${name}.json`, import.meta.url)));
const airports = readFileSync(new URL('./data/airports.txt', import.meta.url), 'utf8')
  .split(/\s+/)
  .filter(Boolean);
const names = readJson('airport-names');
const metros = readJson('lookup-map');
const metroNames = readJson('metro-names');
const directory = [
  ...airports.map((code) => ({
    code,
    city: names[code]?.city,
    name: names[code]?.name,
    airports: [code],
  })),
  ...Object.entries(metros).map(([code, members]) => ({
    code,
    city: metroNames[code]?.city,
    name: `All airports (${members.join(', ')})`,
    airports: members,
  })),
];
const airportSet = new Set(directory.map((x) => x.code));

export function pinNonstopFirst(items) {
  const index = items.findIndex((x) => x.nonstop);
  return index > 0 ? [items[index], ...items.slice(0, index), ...items.slice(index + 1)] : items;
}

export function selectResults(items) {
  return [...new Set(items.map((x) => x.currency))].flatMap((currency) => {
    const group = pinNonstopFirst(items.filter((x) => x.currency === currency));
    const selected = group.slice(0, 10);
    const hidden = group.find((x) => x.isHiddenCity);
    if (hidden && !selected.includes(hidden)) selected[selected.length - 1] = hidden;
    return selected;
  });
}

export function createRoutes({ config, searchFlights }) {
  const router = express.Router();
  router.get('/airports', (_req, res) => res.json(directory));
  router.post(
    '/search',
    rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' },
    }),
    async (request, response) => {
      if (!config.searchConfigured)
        return response.status(503).json({ error: 'Flight search is not configured yet.' });
      const trip = validateTrip(request.body ?? {}, airportSet);
      if (trip.error) return response.status(400).json({ error: trip.error });
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
        if (legs.every((leg) => leg.status === 'rejected'))
          throw legs.find((leg) => leg.reason?.status === 429)?.reason ?? legs[0].reason;
        const result = { meta: {} };
        legs.forEach((leg, index) => {
          const direction = index === 0 ? 'outbound' : 'inbound';
          result[direction] =
            leg.status === 'fulfilled' ? selectResults(leg.value.itineraries) : [];
          result.meta[direction] =
            leg.status === 'fulfilled'
              ? {
                  ...leg.value.meta,
                  available: leg.value.itineraries.length,
                  returned: result[direction].length,
                }
              : {
                  partial: true,
                  error: publicError(leg.reason).message,
                  code: leg.reason?.code,
                  resetAt: leg.reason?.resetAt,
                };
        });
        if (!response.destroyed) response.json(result);
      } catch (error) {
        const safe = publicError(error);
        if (response.destroyed) return;
        if (safe.resetAt)
          response.set(
            'Retry-After',
            String(Math.max(1, Math.ceil((Date.parse(safe.resetAt) - Date.now()) / 1000))),
          );
        response
          .status(safe.status)
          .json({ error: safe.message, code: safe.code, resetAt: safe.resetAt });
      } finally {
        response.off('close', onClose);
      }
    },
  );
  return router;
}
