import * as db from './db.js';
import { findAllOneWayFlights } from './search.js';
import { sendPriceAlertEmail, sendExpiredEmail } from './email.js';

function isExpired(subscription) {
  return new Date(subscription.departure_date) < new Date();
}

async function cheapestItinerary(origin, destination, date, travelers) {
  const results = await findAllOneWayFlights(origin, destination, date, travelers);
  return results[0] ?? null;
}

/**
 * Re-runs every pending subscription's search and notifies if the cheapest
 * price found (summed across both legs for round trips) is under threshold.
 * Called from POST /api/jobs/check-subscriptions, driven by a scheduled
 * GitHub Actions workflow rather than an in-process timer.
 */
export async function checkSubscriptions() {
  const subscriptions = await db.getPendingSubscriptions();
  let checked = 0;
  let matched = 0;

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
      );

      if (!outbound) {
        continue;
      }

      let totalPrice = parseFloat(outbound.price);

      if (subscription.return_date) {
        const inbound = await cheapestItinerary(
          subscription.destination,
          subscription.origin,
          subscription.return_date,
          subscription.num_travelers,
        );
        if (inbound) {
          totalPrice += parseFloat(inbound.price);
        }
      }

      if (totalPrice <= subscription.price_threshold) {
        matched += 1;
        await sendPriceAlertEmail(subscription, outbound);
        await db.markNotified(subscription.id);
      }
    } catch (err) {
      console.error(`[jobs] failed processing subscription ${subscription.id}:`, err.message);
    }
  }

  return { checked, matched };
}
