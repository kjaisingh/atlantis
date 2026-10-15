# Atlantis

Atlantis compares ordinary nonstop fares with hidden-city itineraries, where the intended destination is a connection. It links to matching Kayak searches for booking and does not handle tickets or payment. [Open Atlantis](https://atlantis-xoxe.onrender.com).

Hidden-city travel carries risks: checked bags may continue to the ticketed destination, skipping a leg can cancel later legs, and rerouting or transit rules may make an itinerary unusable. Confirm the final fare and terms before booking.

## Features

- Search one-way or round-trip flights by airport or metro area and traveler count.
- Compare nonstop and hidden-city routes; filter or sort by price, route, and departure time.
- Keep currencies separate and label partial results when provider requests fail or search coverage is limited.
- Open a matching Kayak search to check the current itinerary and price.
- Optionally receive email price alerts when Supabase and SMTP delivery are configured.

## Architecture

- React and Vite provide the client; Express serves the API and built app on Render.
- The API validates requests, plans a bounded set of routes from airport and candidate data, and queries Duffel.
- Search results are normalized, deduplicated, and grouped by currency.
- Optional Supabase Postgres stores price subscriptions; SMTP sends matching alerts from a scheduled job.

## Setup

1. Install Node.js 22 or newer and get a Duffel API token. Install dependencies.

   ```bash
   npm ci
   ```

2. Copy [`.env.example`](.env.example) to `.env` and set `DUFFEL_API_KEY`.

   ```bash
   cp .env.example .env
   ```

3. Start the local app at <http://localhost:5173>.

   ```bash
   npm run dev
   ```

4. To enable price alerts, create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor. Set the Supabase and SMTP values, `SUBSCRIPTIONS_ENABLED=true`, and `JOB_SECRET`. Add `ATLANTIS_URL` and `JOB_SECRET` as GitHub Actions secrets for scheduled delivery.
5. Deploy with the [Render Blueprint](render.yaml), setting `DUFFEL_API_KEY` and any optional alert values there.

## Feature backlog

- Refresh route candidates automatically and expand search coverage.
- Add a second fare provider for comparison and failover.
- Show more fare-rule and transit details before users leave for booking.
- Add saved searches, alert management, and price history.
- Queue provider and email work, with monitoring and independent database backups.
