# Atlantis operations

[![Build](https://github.com/kjaisingh/atlantis/actions/workflows/build.yml/badge.svg)](https://github.com/kjaisingh/atlantis/actions/workflows/build.yml)
[![CodeQL](https://github.com/kjaisingh/atlantis/actions/workflows/codeql.yml/badge.svg)](https://github.com/kjaisingh/atlantis/actions/workflows/codeql.yml)

Atlantis compares ordinary nonstop fares with hidden-city itineraries: tickets whose connection is the traveler’s intended destination. It searches and links to matching Kayak results; it never books travel or handles payment.

## What it does

- Searches one-way and round-trip routes through Duffel.
- Compares prices only within the same ISO currency.
- Shows nonstop and hidden-city options with price, route, and departure filters.
- Reports partial results when an upstream request fails or the request budget truncates coverage.
- Optionally stores price alerts in Supabase and sends them through SMTP.

## Important travel risks

Hidden-city travel is not appropriate for every trip. Use carry-on baggage only: checked bags normally continue to the ticketed destination. Skipping a segment cancels every later segment on that ticket, so return travel must be booked separately. Airlines may reroute a connection, restrict loyalty-account benefits, or treat repeated use as a fare-rule violation. Travelers remain responsible for visa, entry, and transit requirements at every airport.

## How search works

Duffel prices a requested origin and ticketed destination. Atlantis plans up to four requests per direction:

1. Concrete origin/destination pairs are planned first, including metro aliases from `lookup-map.json`.
2. Remaining budget is filled with hidden-city candidates from `cache-table.json`.
3. Offers that actually pass through the requested destination are normalized and deduplicated by route, flight number, and departure time.
4. Results are grouped by currency and sorted by numeric price within each currency.

Four requests are a budget, not a completeness guarantee. Large metro combinations and routes with many cached candidates can be truncated. The API exposes `meta.outbound` and `meta.inbound` with `requested`, `succeeded`, `failed`, `totalCandidates`, `truncated`, and `partial`; the UI shows this state.

## Architecture

```text
React + Vite UI
       │ /api
Express app factory ── validated routes ── search planner ── Duffel API
       │
       ├── Supabase subscriptions (optional)
       └── SMTP delivery (optional)
```

- `src/`: React UI and API client.
- `server/app.js`: testable Express application factory.
- `server/index.js`: process startup and graceful shutdown only.
- `server/routes.js`: HTTP contracts, rate limits, and capability gates.
- `server/search.js`: request planning, normalization, and deduplication.
- `server/duffel.js`: bounded fetch client, concurrency, timeout, and retry logic.
- `server/data/`: precomputed airport and hidden-city candidate data.
- `supabase/`: repeatable baseline schema and additive migrations.

## Local development

Requirements: Node.js 22+ and a Duffel test or live token.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>. Keep live API tokens in `.env`; never commit them. If a token is exposed, revoke it before removing it from history.

### Environment variables

| Variable                                           | Required             | Purpose                                                  |
| -------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `PORT`                                             | No                   | Express port; defaults to `3000`.                        |
| `DUFFEL_API_KEY`                                   | For search           | Duffel test or live token.                               |
| `SUPABASE_URL`                                     | For alerts           | Supabase project URL.                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                        | For alerts           | Server-only service-role key.                            |
| `SUBSCRIPTION_SCHEMA_VERSION`                      | For alerts           | Set to `20261013` after applying the currency migration. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | For alerts           | SMTP delivery; all four are required.                    |
| `SMTP_PORT`                                        | No                   | Defaults to `587`.                                       |
| `JOB_SECRET`                                       | For scheduled checks | Shared secret for alerts and database keepalive.         |

Alerts require both Supabase values, all SMTP values, and the current schema version. Missing SMTP never falls back to logging recipient data or marking an alert sent.

## Database setup and migration

For a new project, run `supabase/schema.sql` in Supabase SQL Editor. Never rerun the full schema against production merely to add a migration. Existing deployments created before currency-aware alerts must first run:

```text
supabase/migrations/20261013_add_subscription_currency.sql
```

The migration assigns `USD` to existing rows. Review or pause old alerts if their original currency is unknown, especially pending future trips. Then set `SUBSCRIPTION_SCHEMA_VERSION=20261013` in Render. Until then, search remains available and new alert creation stays safely disabled. Do not enable alerts until SMTP delivery is configured and tested.

`supabase/migrations/20261015_keepalive.sql` installs a read-only, three-day `pg_cron` query. It can be applied independently of the currency migration. Check `cron.job` for `atlantis-keepalive` and `cron.job_run_details` for actual success; an active job alone does not prove future runs will work.

## Commands

| Command                 | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Run Vite and Express with API proxying.              |
| `npm test`              | Run server unit and integration tests.               |
| `npm run validate:data` | Validate airport, metro, and cache contracts.        |
| `npm run lint`          | Run ESLint.                                          |
| `npm run format:check`  | Verify Prettier formatting.                          |
| `npm run build`         | Build production assets into `dist/`.                |
| `npm run test:e2e`      | Build and run desktop/mobile Playwright smoke tests. |
| `npm run check`         | Run formatting, lint, data, tests, and build.        |

`npm run test:e2e` builds fresh assets, starts a local production server, and intercepts API calls with deterministic fixtures. Set `SMOKE_URL` to test an already-running deployment. Set `SMOKE_LIVE=1` only for an intentional live Duffel check: it sends one real search through the provider. A local live check also requires `DUFFEL_API_KEY`.

## Data maintenance

`server/data/cache-table.json` is generated route-candidate data, not an authoritative schedule. Do not hand-edit it without a reproducible source. `npm run validate:data` checks JSON shape, code formats, duplicate airports, metro membership, cache-pair uniqueness, and duplicate candidates. Missing display metadata is reported as a warning because airport provenance is incomplete.

## API

- `GET /api/health`: status, deployed commit version, and enabled capabilities.
- `GET /api/airports`: searchable airport and metro directory.
- `POST /api/search`: validated flight search.
- `POST /api/subscribe`: price-alert creation; disabled unless database, SMTP, and schema are ready.
- `POST /api/jobs/check-subscriptions`: secret-guarded scheduled delivery.
- `POST /api/keepalive`: secret-guarded, bounded database read; returns `{"database":"reachable"}` only when the database answers.

Search accepts `{origin, destination, departureDate, returnDate?, travelers}`. Alert creation adds `{name, email, priceThreshold, currency}` and returns only an ID, timestamp, and status message—not stored PII.

## Deployment and CI

`render.yaml` defines the Render service on Node 22. Configure all secrets in Render, and set GitHub Actions secrets `ATLANTIS_URL` and `JOB_SECRET`.

CI runs formatting, lint, data validation, unit/integration tests, production build, high-severity production dependency audit, and deterministic browser tests. CodeQL runs on pushes, pull requests, and weekly; Dependabot covers npm and GitHub Actions; pull requests receive dependency review. After a successful `main` build, deployment verification waits until `/api/health` reports the exact pushed commit SHA, then checks the home page and airport API.

The daily subscription workflow intentionally has no manual-dispatch button because running it can send real email. It logs an explicit skip when alerts are disabled; the delivery endpoint itself returns 503 rather than reporting a misleading success. The separate database keepalive workflow runs every two days and can be dispatched safely after deployment; it requires the same `ATLANTIS_URL` and `JOB_SECRET` GitHub secrets already used by the delivery workflow.

Supabase Free can still pause or become unavailable despite periodic queries, and GitHub can disable scheduled workflows after prolonged repository inactivity. Render Free also sleeps between requests. Neither workflow is a backup or uptime guarantee. Keep an encrypted, independently stored database export; use paid infrastructure if uninterrupted availability or point-in-time recovery is required.

## License

[MIT](../LICENSE)
