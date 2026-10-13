import * as db from './db.js';
import { searchOneWay } from './search.js';
import { sendPriceAlertEmail, sendExpiredEmail } from './email.js';

let running = false;

export function isExpired(subscription, today = new Date().toISOString().slice(0, 10)) {
  return subscription.departure_date < today;
}

async function cheapestItinerary(origin, destination, date, travelers, currency) {
  const { itineraries } = await searchOneWay(origin, destination, date, travelers);
  return (
    itineraries
      .filter((itinerary) => itinerary.currency === currency)
      .sort((left, right) => Number(left.price) - Number(right.price))[0] ?? null
  );
}

/**
 * Re-runs every pending subscription's search and notifies if the cheapest
 * price found (summed across both legs for round trips) is under threshold.
 * Called from POST /api/jobs/check-subscriptions, driven by a scheduled
 * GitHub Actions workflow rather than an in-process timer.
 */
async function processSubscriptions() {
  const subscriptions = await db.getPendingSubscriptions();
  let checked = 0;
  let matched = 0;
  const failures = [];

  for (const subscription of subscriptions) {
    checked += 1;

    try {
      if (isExpired(subscription)) {
        await sendExpiredEmail(subscription);
        await db.deleteSubscription(subscription.id);
        continue;
      }

      const outbound = await cheapestItinerary(
        subscription.origin,
        subscription.destination,
        subscription.departure_date,
        subscription.num_travelers,
        subscription.currency,
      );

      if (!outbound) {
        continue;
      }

      let inbound = null;
      let totalPrice = parseFloat(outbound.price);

      if (subscription.return_date) {
        inbound = await cheapestItinerary(
          subscription.destination,
          subscription.origin,
          subscription.return_date,
          subscription.num_travelers,
          subscription.currency,
        );
        if (!inbound) {
          continue;
        }
        totalPrice += parseFloat(inbound.price);
      }

      if (totalPrice <= subscription.price_threshold) {
        matched += 1;
        await sendPriceAlertEmail(subscription, outbound, inbound, totalPrice);
        await db.markNotified(subscription.id);
      }
    } catch (err) {
      console.error(`[jobs] failed processing subscription ${subscription.id}:`, err.message);
      failures.push(err);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} subscription checks failed.`);
  }
  return { checked, matched };
}

export async function checkSubscriptions() {
  if (running) throw new Error('A subscription check is already running.');
  running = true;
  try {
    return await processSubscriptions();
  } finally {
    running = false;
  }
}
