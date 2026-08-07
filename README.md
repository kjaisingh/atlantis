# Atlantis
Atlantis is a hidden-city flight search tool: it finds itineraries where the airport you actually
want to fly to is just a layover on a *cheaper* ticket to somewhere further away.

Here's the trick it's built around. Airlines usually price a one-stop itinerary lower than the
non-stop leg buried inside it — a ticket from JFK to ORD with a layover in DTW can cost less than a
ticket straight from JFK to DTW. If DTW was your real destination all along, you book the JFK→ORD
fare, get off at the layover, and walk away without ever boarding the second flight. Atlantis searches
for exactly these opportunities: give it a real origin and destination, and it checks the direct fare
against fares to every other airport in its cache that happens to route through your destination
first.

**A note on legality:** hidden-city ticketing (also called "point-beyond" ticketing) is not illegal,
but it usually violates an airline's contract of carriage. Airlines have been known to cancel the
rest of a ticket, claw back frequent-flyer miles, or ban repeat offenders — especially for travelers
who do it often. This is a research tool, not booking advice: use it at your own risk. Atlantis
surfaces the itineraries and links out to book them elsewhere; it never books anything itself.


## Overview
- **Search**: enter an origin, destination, date(s), and traveler count. Atlantis checks the direct
  fare to your real destination, then cross-references its cache of routes to find every other
  airport that's reachable through your destination as a layover, and prices out a ticket to each one.
- **Compare**: results come back sorted cheapest-first, with the direct-to-destination fare always
  pinned at the top of the list so you can see at a glance exactly how much a hidden-city option would
  save — or whether it's not worth the risk this time.
- **Book**: each result links out to a matching Kayak search pre-filled with the right route and
  dates. Atlantis is a search tool, not a travel agent — it never touches payment or booking.
- **Subscribe**: found a route you're watching but the price isn't there yet? Leave your email, a
  route, and a price threshold, and a scheduled job re-checks it periodically. The moment a matching
  fare under your threshold appears, you get an email — no need to keep the tab open.


## How It Works
Duffel's flight search API only answers "what does this exact origin→destination itinerary cost" —
it has no concept of hidden-city fares on its own. Atlantis builds that on top:

1. A precomputed cache (`server/data/cache-table.json` + `lookup-map.json`) maps each origin airport
   to a shortlist of destinations that are known to have flights routing through it as a layover —
   roughly 600 origin airports and ~6,000 candidate routes in total.
2. A search looks up the requested origin in that cache, then fires off a Duffel `offer_request` for
   the direct route plus one for every candidate destination on the shortlist.
3. Each result is normalized to a common shape (segments, layovers, price, cabin), the metro-area
   aliases in the destination are resolved so, say, all of London's airports count as the same city,
   and everything is sorted by price with the direct fare always surfaced first.
4. Round trips run this whole process twice — once per direction — and pair up outbound/inbound
   results independently rather than cross-producing every combination.

Duffel's live-account rate limit is a fixed window (10 requests per ~30 seconds), which a single
round-trip search can bump up against on its own. Requests are sent sequentially rather than in
parallel, and a 429 response triggers a wait-and-retry keyed off Duffel's `ratelimit-reset` header
rather than a blind fixed delay.

Atlantis's own API also rate-limits per client IP, independent of Duffel's: `/api/search` allows 10
requests per minute, `/api/subscribe` allows 20 per hour. Both return a 429 with a plain-English
message when exceeded.


## Feature Backlog
- Expand the hidden-city candidate cache beyond its current ~600 origin airports.
- Multi-city and open-jaw itineraries, not just one-way/round-trip.
- Per-user saved searches instead of one-off email subscriptions.
- Historical price chart per route.


## Tech Stack
- Frontend: React + Vite.
- Backend: Node.js + Express (ESM, stateless JSON API).
- Flight data: [Duffel](https://duffel.com) API.
- Database: Supabase Postgres (subscriptions only — optional).
- Email: SMTP via Nodemailer (optional).
- Scheduled jobs: GitHub Actions, calling a secret-guarded API endpoint.
- Hosting target: Render.


## Local Development
1. Install dependencies.
```bash
npm install
```

2. Create a local env file.
```bash
cp .env.example .env
```

3. Sign up for a free account at [duffel.com](https://duffel.com) and grab an API token from your
   workspace's developer settings. Duffel issues both a `duffel_test_...` sandbox token (mock offers,
   no cost, good for kicking the tires) and a `duffel_live_...` token (real airline offers, requires
   account verification). Either works — paste it into `.env` as `DUFFEL_API_KEY`. Everything else in
   `.env` is optional — see [Environment Variables](#environment-variables) for what each one unlocks.

4. Start backend + frontend together.
```bash
npm run dev
```

5. Open the app.
```bash
http://localhost:5173
```


## Scripts
- `npm run dev` — run the Express API and the Vite dev server together, with the frontend proxying
  `/api` requests to the backend.
- `npm run dev:server` — just the backend, auto-restarting on change via nodemon.
- `npm run dev:client` — just the Vite dev server.
- `npm run build` — production frontend build, output to `dist/`.
- `npm start` — run the production server, which serves `dist/` and the JSON API from one process.
- `npm run preview` — serve the built frontend locally without the backend, for a quick static check.


## Production Build
```bash
npm run build
npm start
```

The server runs on `PORT` (default `3000`) and serves the built frontend from `dist`.


## Deployment
### Blueprint
1. Push this repo to GitHub.
2. In Render, choose **New +** → **Blueprint**.
3. Select your GitHub repo.
4. Render reads `render.yaml` and prompts for the secret env vars it declares.

### Manual Web Service
- Build Command: `npm ci && npm run build`.
- Start Command: `npm start`.
- Runtime: Node 18+.
- Set env vars per the table below.

### Scheduled subscription checks
`.github/workflows/check-subscriptions.yml` calls `POST /api/jobs/check-subscriptions` on a daily
schedule. Set `JOB_SECRET` identically as a GitHub Actions repository secret and as a Render env var,
and set the workflow's target URL to your deployed app. This also has the side effect of waking a
free Render instance from its idle spin-down, since Render's free tier sleeps a service after 15
minutes without traffic.


## Environment Variables
- `PORT`: backend port (Render sets this automatically).
- `DUFFEL_API_KEY`: **required**. Flight search returns nothing without it. A `duffel_test_...` key
  works for local development against mock data; a `duffel_live_...` key returns real airline offers.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Supabase project URL and server-only `service_role`
  key (Settings → API). Run `supabase/schema.sql` against your project first. Optional — without
  both set, search still works and `/api/subscribe` returns a clean "not configured" message.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`: SMTP credentials for
  subscription price-alert emails (a Gmail app password works). Optional — without all four set,
  emails are logged to the console instead of sent.
- `JOB_SECRET`: shared secret required in the `x-job-secret` header to call
  `POST /api/jobs/check-subscriptions`. Only needed if you're using subscriptions.

Subscriptions and email are best-effort: if their env vars are omitted or misconfigured, flight
search keeps working — subscribing just isn't available.
