# Atlantis

Atlantis compares ordinary fares with hidden-city itineraries, where the intended destination is a connection. It links to Google Flights to recheck fares and does not handle tickets or payment. [Open Atlantis](https://atlantis-xoxe.onrender.com).

Hidden-city travel carries risks: checked bags may continue to the ticketed destination, skipping a leg can cancel later legs, and rerouting or transit rules may make an itinerary unusable. Board at the ticket's starting airport. Book each direction separately and confirm the complete itinerary and terms before purchase.

## Features

- Search one-way or round-trip flights by airport or metro area and traveler count.
- Compare nonstop and hidden-city routes; filter or sort by price, route, and departure time.
- See the full ticket route, where to exit, airport-local times, and fare freshness.
- Retain successful results when one round-trip direction fails.
- Reuse route candidates for 30 days and exact fares for 10 minutes.

## Architecture

- React and Vite provide the client; Express serves the API and built app on Render.
- Official [BTS T-100 passenger segments](https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Air%20Carriers) rank up to three onward airports by recent same-carrier service. A monthly job refreshes this historical graph in Supabase. It suggests routes, not guaranteed connections.
- SerpApi's Google Flights API prices the requested route plus those endpoints. Only complete itineraries starting at the selected origin and passing through the requested destination qualify. Coverage is limited, especially outside the US.
- Supabase stores origin/destination candidates with a fixed 30-day expiry, observed hidden-city endpoints, and separate 10-minute fare caches. Atomic reservations share concurrent searches and cap fresh one-way comparisons at 10 per rolling day, 50 per rolling 31 days, and 200 provider calls per rolling 31 days. Round trips count as two comparisons; cached fares consume no provider allowance. Failed requests still count.

## Setup

1. Install Node.js 22+, Python 3, and dependencies with `npm ci`. Create a free [SerpApi](https://serpapi.com) account and a Supabase project.
2. Copy [`.env.example`](.env.example) to `.env` and set the three credentials. Run [`supabase/schema.sql`](supabase/schema.sql) in Supabase's SQL Editor, then initialize the graph:

   ```bash
   node --env-file=.env -e "require('node:child_process').execFileSync('python3', ['scripts/update-routes.py', '--publish'], {stdio: 'inherit'})"
   ```

3. Run `npm run dev` at <http://localhost:5173>. Verify changes with `npm run check` and `npm run test:e2e`.
4. Deploy with the [Render Blueprint](render.yaml). Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets for the monthly route refresh. Keep SerpApi on its Free Plan; the app's 200-call cap leaves room below its 250-search monthly allowance.

## Feature backlog

- Expand route coverage beyond US-reported segments.
- Improve candidate ranking with observed connections and seasonal schedules.
- Show more fare-rule and transit details before users leave for booking.
