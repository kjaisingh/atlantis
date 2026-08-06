# Atlantis
Hidden-city ticketing finder: search a route and see whether flying to somewhere *further* than your
real destination, and getting off at the layover, is cheaper than a ticket to your real destination
alone.

**A note on legality:** hidden-city ticketing (also called "point-beyond" ticketing) is not illegal,
but it usually violates an airline's contract of carriage. Airlines have been known to cancel the
rest of a ticket, claw back frequent-flyer miles, or ban repeat offenders. Use this at your own risk —
Atlantis surfaces the itineraries, it doesn't book them.


## Overview
- **Search**: enter an origin, destination, date(s), and traveler count. Atlantis checks fares to your
  real destination alongside fares to every airport in its cache that routes through your destination
  as a layover, and returns both sorted by price.
- **Compare**: the direct-to-destination fare is always shown first, so you can see exactly how much
  the hidden-city option saves.
- **Book**: each result links out to a matching Kayak search — Atlantis never books for you.
- **Subscribe**: leave your email and a price threshold on a route, and a scheduled job re-checks it
  and emails you the moment a match under your threshold appears.


## Feature Backlog
- Expand the hidden-city candidate cache beyond its current ~600 origin airports.
- Multi-city and open-jaw itineraries, not just one-way/round-trip.
- Per-user saved searches instead of one-off email subscriptions.
- Historical price chart per route.


## Tech Stack
- Frontend: React + Vite.
- Backend: Node.js + Express.
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

3. Add your [Duffel](https://duffel.com) API key to `.env`. Everything else is optional — see
   [Environment Variables](#environment-variables).

4. Start backend + frontend.
```bash
npm run dev
```

5. Open app.
```bash
http://localhost:5173
```


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
free Render instance from its idle spin-down.


## Environment Variables
- `PORT`: backend port (Render sets this automatically).
- `DUFFEL_API_KEY`: **required**. Flight search returns nothing without it.
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
