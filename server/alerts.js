import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { validateTrip } from './validation.js';
import { SearchError } from './errors.js';
import { createMailer } from './email.js';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const alertToken = (id, action, secret) =>
  createHmac('sha256', secret).update(`${id}:${action}`).digest('hex');

export function authorizedJob(header, secret) {
  const actual = Buffer.from(header || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  return Boolean(secret) && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateAlert(body, airports, now) {
  const trip = validateTrip(body, airports, now);
  if (trip.error) return trip;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: 'Enter a valid email address.' };
  const threshold = body.priceThreshold;
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < 0.01 ||
    threshold > 1_000_000 ||
    Math.abs(threshold * 100 - Math.round(threshold * 100)) > 0.000001
  )
    return {
      error: 'Enter a USD price between 0.01 and 1,000,000, with at most two decimal places.',
    };
  return { value: { trip: trip.value, email, threshold } };
}

function cheapest(result) {
  return result.itineraries
    .filter((fare) => fare.currency === 'USD' && Number(fare.price) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price))[0];
}

function describeFare(fare, label) {
  return (
    `${label}: ${fare.path}\n${fare.airline}, departs ${fare.departureTime}\n` +
    (fare.isHiddenCity
      ? `Board at ${fare.segments[0].origin}; exit at ${fare.layoverCity}. Ticket ends at ${fare.finalDestination}; skip remaining flights.\n`
      : '') +
    `Recheck on Google Flights: ${fare.bookingLink}`
  );
}

export function createAlerts({ config, store, search, send = createMailer(config) }) {
  const link = (id, action) =>
    `${config.appUrl}/#alert-${action}=${alertToken(id, action, config.jobSecret)}`;
  return {
    async subscribe({ trip, email, threshold }) {
      const id = randomUUID();
      const row = await store.createAlert({
        p_id: id,
        p_email: email,
        p_trip: trip,
        p_key: hashToken(JSON.stringify(trip)),
        p_threshold: threshold,
        p_verify: hashToken(alertToken(id, 'verify', config.jobSecret)),
        p_unsubscribe: hashToken(alertToken(id, 'unsubscribe', config.jobSecret)),
      });
      if (!row?.id) return;
      try {
        await send({
          to: email,
          key: id,
          subject: 'Confirm your Atlantis price alert',
          text: `Confirm your weekly alert for ${trip.origin} → ${trip.destination}, ${trip.departureDate}${trip.returnDate ? ` through ${trip.returnDate}` : ''}, ${trip.travelers} traveler(s), at or below USD ${threshold.toFixed(2)} total.\n\n${link(id, 'verify')}\n\nThis confirmation expires in 24 hours. Checks depend on free search capacity. We send one matching fare, then stop; alerts expire after departure day.\n\nIf you did not request this, ignore this email or cancel: ${link(id, 'unsubscribe')}`,
        });
      } catch (error) {
        if (error.ambiguous === false) await store.finishAlert(id, null, 'confirmation_rejected');
        throw new SearchError(
          error.ambiguous === false
            ? 'Confirmation email could not be sent. Please try again later.'
            : 'Email delivery could not be confirmed. Check your inbox before trying again.',
          { status: 503 },
        );
      }
    },
    async action(token, action) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
        throw new SearchError('This alert link is invalid or expired.', { status: 400 });
      const result = await store.alertAction(hashToken(token), action);
      if (!result)
        throw new SearchError(
          'This alert link is invalid or expired. Create a new alert from your search.',
          { status: 400 },
        );
    },
    async check() {
      const owner = randomUUID();
      const rows = await store.claimAlerts(owner);
      if (!rows.length) return { checked: 0, notified: 0, deferred: 0, unknown: 0, more: false };
      const trip = rows[0].trip;
      const memo = new Map();
      const leg = (origin, destination, date) => {
        const key = JSON.stringify([origin, destination, date, trip.travelers]);
        if (!memo.has(key)) memo.set(key, search(origin, destination, date, trip.travelers));
        return memo.get(key);
      };
      let outbound, inbound;
      try {
        [outbound, inbound] = await Promise.all([
          leg(trip.origin, trip.destination, trip.departureDate),
          trip.returnDate ? leg(trip.destination, trip.origin, trip.returnDate) : null,
        ]);
        if (outbound.meta?.partial || inbound?.meta?.partial)
          throw new Error('Incomplete comparison');
      } catch {
        await Promise.all(rows.map((row) => store.finishAlert(row.id, owner, 'deferred')));
        return {
          checked: rows.length,
          notified: 0,
          deferred: rows.length,
          unknown: 0,
          more: false,
        };
      }
      const out = cheapest(outbound),
        back = inbound ? cheapest(inbound) : null;
      const total =
        out && (!inbound || back)
          ? (Math.round(Number(out.price) * 100) + Math.round(Number(back?.price || 0) * 100)) / 100
          : Infinity;
      const summary = { checked: rows.length, notified: 0, deferred: 0, unknown: 0, more: true };
      await Promise.all(
        rows.map(async (row) => {
          if (total > Number(row.threshold)) {
            await store.finishAlert(row.id, owner, 'checked');
            return;
          }
          if (!(await store.finishAlert(row.id, owner, 'prepare'))) return;
          try {
            await send({
              to: row.email,
              key: row.delivery_key,
              subject: `Atlantis price match: ${trip.origin} → ${trip.destination}`,
              text: `Found a fare at USD ${total.toFixed(2)} for ${trip.travelers} traveler(s)${back ? ', both directions combined' : ''}. Your target: USD ${Number(row.threshold).toFixed(2)}.\n\n${describeFare(out, 'Outbound')}${back ? `\n\n${describeFare(back, 'Return')}` : ''}\n\nPrices may change. Book each direction separately. Hidden-city travel requires boarding at the first airport, carry-on baggage only, and checking airline and transit rules.\n\nThis one-time alert is now complete. Cancel alert: ${link(row.id, 'unsubscribe')}`,
            });
            await store.finishAlert(row.id, owner, 'notified');
            summary.notified++;
          } catch (error) {
            const outcome = error.ambiguous === false ? 'rejected' : 'unknown';
            await store.finishAlert(row.id, owner, outcome);
            summary[outcome === 'unknown' ? 'unknown' : 'deferred']++;
          }
        }),
      );
      return summary;
    },
  };
}
