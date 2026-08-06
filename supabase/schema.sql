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
