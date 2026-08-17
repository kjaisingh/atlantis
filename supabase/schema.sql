create extension if not exists "pgcrypto";

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  origin text not null,
  destination text not null,
  departure_date date not null,
  return_date date,
  num_travelers int not null default 1,
  price_threshold numeric not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

alter table subscriptions enable row level security;
-- No policies are defined: the server only ever talks to Supabase with the
-- service_role key, which bypasses RLS. This table is intentionally
-- unreachable from anon/authenticated clients.

-- Keepalive: Supabase free tier pauses projects idle 7+ days. This job runs
-- every 3 days directly inside Postgres so the project always shows activity,
-- independent of whether the app server (Render) is awake.
create extension if not exists pg_cron;
select cron.schedule('keepalive', '0 0 */3 * *', $$ select 1 $$);
