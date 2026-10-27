alter table public.atlantis_search_usage add column if not exists source text not null default 'interactive'
  check (source in ('interactive', 'alert'));

create or replace function public.atlantis_claim_alert_search(p_key text, p_owner uuid, p_calls integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.atlantis_fare_cache;
  v_daily integer;
  v_monthly integer;
  v_calls integer;
  v_reset timestamptz;
  v_alert_daily integer;
  v_alert_monthly integer;
  v_alert_calls integer;
begin
  if p_calls < 1 or p_calls > 4 or p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid search reservation';
  end if;
  -- Serialize cache claims and quota reservations across every app instance.
  perform pg_advisory_xact_lock(749201026);
  select * into v_row from public.atlantis_fare_cache where key = p_key;
  if found and v_row.expires_at > now() then
    return jsonb_build_object('status', v_row.state, 'result', v_row.result);
  end if;
  select count(*) filter (where created_at > now() - interval '24 hours'),
    count(*), coalesce(sum(calls), 0) into v_daily, v_monthly, v_calls
    from public.atlantis_search_usage where created_at > now() - interval '31 days';
  if v_daily >= 10 then
    select min(created_at) + interval '24 hours' into v_reset from public.atlantis_search_usage
      where created_at > now() - interval '24 hours';
    return jsonb_build_object('status', 'limited', 'code', 'daily_limit', 'resetAt', v_reset);
  end if;
  if v_monthly >= 50 or v_calls + p_calls > 200 then
    select min(created_at) + interval '31 days' into v_reset from public.atlantis_search_usage
      where created_at > now() - interval '31 days';
    return jsonb_build_object('status', 'limited', 'code', 'monthly_limit', 'resetAt', v_reset);
  end if;
  select count(*) filter (where created_at > now() - interval '24 hours'),
    count(*), coalesce(sum(calls), 0) into v_alert_daily, v_alert_monthly, v_alert_calls
    from public.atlantis_search_usage where source = 'alert' and created_at > now() - interval '31 days';
  if v_alert_daily >= 2 or v_alert_monthly >= 20 or v_alert_calls + p_calls > 80 then
    return jsonb_build_object('status', 'limited', 'code', 'alert_limit');
  end if;
  insert into public.atlantis_search_usage(calls, source) values(p_calls, 'alert');
  insert into public.atlantis_fare_cache(key, owner, state, expires_at)
    values(p_key, p_owner, 'pending', now() + interval '2 minutes')
    on conflict (key) do update set owner = excluded.owner, state = 'pending', result = null,
      expires_at = excluded.expires_at;
  delete from public.atlantis_search_usage where created_at < now() - interval '32 days';
  delete from public.atlantis_fare_cache where expires_at < now() - interval '1 day';
  return jsonb_build_object('status', 'owner');
end;
$$;

create table if not exists public.atlantis_price_alerts (
  id uuid primary key,
  email text,
  trip jsonb not null,
  search_key text not null,
  threshold numeric(12,2) not null check (threshold > 0 and threshold <= 1000000),
  state text not null default 'pending' check (state in ('pending','active','sending','notified','unknown','cancelled','expired')),
  verify_hash text,
  unsubscribe_hash text,
  created_at timestamptz not null default now(),
  verify_expires_at timestamptz not null default now() + interval '24 hours',
  next_check_at timestamptz not null default now(),
  owner uuid,
  lease_until timestamptz,
  delivery_key uuid not null default gen_random_uuid()
);
create unique index if not exists atlantis_alert_unique on public.atlantis_price_alerts(email, search_key)
  where state in ('pending','active','sending');
create index if not exists atlantis_alert_due on public.atlantis_price_alerts(next_check_at) where state = 'active';
alter table public.atlantis_price_alerts enable row level security;
revoke all on public.atlantis_price_alerts from anon, authenticated;
grant all on public.atlantis_price_alerts to service_role;

create or replace function public.atlantis_create_alert(
  p_id uuid, p_email text, p_trip jsonb, p_key text, p_threshold numeric, p_verify text, p_unsubscribe text
) returns public.atlantis_price_alerts language plpgsql security definer set search_path = public as $$
declare v_row public.atlantis_price_alerts;
begin
  perform pg_advisory_xact_lock(749201027);
  update public.atlantis_price_alerts set state = 'expired', email = null, verify_hash = null, unsubscribe_hash = null
    where state = 'pending' and verify_expires_at <= now();
  delete from public.atlantis_price_alerts where state in ('notified','unknown','cancelled','expired') and created_at < now() - interval '32 days';
  if exists (select 1 from public.atlantis_price_alerts where email = p_email and search_key = p_key and state in ('pending','active','sending')) then
    return null;
  end if;
  if (select count(*) from public.atlantis_price_alerts where created_at > now() - interval '24 hours') >= 50
    or (select count(*) from public.atlantis_price_alerts where state in ('pending','active','sending')) >= 25
    or (select count(*) from public.atlantis_price_alerts where email = p_email and state in ('pending','active','sending')) >= 3 then
    raise exception 'Alert capacity reached';
  end if;
  insert into public.atlantis_price_alerts(id, email, trip, search_key, threshold, verify_hash, unsubscribe_hash)
    values(p_id, p_email, p_trip, p_key, p_threshold, p_verify, p_unsubscribe) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.atlantis_alert_action(p_hash text, p_action text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_action = 'verify' then
    update public.atlantis_price_alerts set state = 'active'
      where verify_hash = p_hash and state = 'pending' and verify_expires_at > now()
        and (trip->>'departureDate')::date >= (now() at time zone 'UTC')::date;
    if found then return true; end if;
    return exists (select 1 from public.atlantis_price_alerts where verify_hash = p_hash and state = 'active');
  elsif p_action = 'unsubscribe' then
    update public.atlantis_price_alerts set state = 'cancelled', email = null, verify_hash = null,
      unsubscribe_hash = null, owner = null, lease_until = null
      where unsubscribe_hash = p_hash;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.atlantis_claim_alerts(p_owner uuid)
returns setof public.atlantis_price_alerts language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  perform pg_advisory_xact_lock(749201028);
  update public.atlantis_price_alerts set state = 'unknown', email = null, verify_hash = null, unsubscribe_hash = null
    where state = 'sending' and lease_until <= now();
  update public.atlantis_price_alerts set state = 'expired', email = null, verify_hash = null, unsubscribe_hash = null
    where (state = 'pending' and verify_expires_at <= now())
      or (state = 'active' and (trip->>'departureDate')::date < (now() at time zone 'UTC')::date);
  select search_key into v_key from public.atlantis_price_alerts
    where state = 'active' and next_check_at <= now() and (lease_until is null or lease_until <= now())
    order by next_check_at, created_at limit 1 for update skip locked;
  if not found then return; end if;
  return query update public.atlantis_price_alerts set owner = p_owner, lease_until = now() + interval '2 minutes'
    where state = 'active' and search_key = v_key and next_check_at <= now() and (lease_until is null or lease_until <= now()) returning *;
end;
$$;

create or replace function public.atlantis_finish_alert(p_id uuid, p_owner uuid, p_outcome text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_outcome = 'prepare' then
    update public.atlantis_price_alerts set state = 'sending', lease_until = now() + interval '1 minute'
      where id = p_id and state = 'active' and owner = p_owner and lease_until > now();
  elsif p_outcome = 'checked' then
    update public.atlantis_price_alerts set next_check_at = now() + interval '7 days', owner = null, lease_until = null
      where id = p_id and state = 'active' and owner = p_owner and lease_until > now();
  elsif p_outcome = 'deferred' then
    update public.atlantis_price_alerts set next_check_at = now() + interval '1 day', owner = null, lease_until = null
      where id = p_id and state = 'active' and owner = p_owner and lease_until > now();
  elsif p_outcome in ('notified','unknown') then
    update public.atlantis_price_alerts set state = p_outcome, email = null, verify_hash = null, unsubscribe_hash = null,
      owner = null, lease_until = null where id = p_id and state = 'sending' and owner = p_owner;
  elsif p_outcome = 'rejected' then
    update public.atlantis_price_alerts set state = 'active', next_check_at = now() + interval '1 day', owner = null, lease_until = null
      where id = p_id and state = 'sending' and owner = p_owner;
  elsif p_outcome = 'confirmation_rejected' then
    update public.atlantis_price_alerts set state = 'cancelled', email = null, verify_hash = null, unsubscribe_hash = null
      where id = p_id and state = 'pending';
  end if;
  return found;
end;
$$;

revoke all on function public.atlantis_claim_alert_search(text,uuid,integer),
  public.atlantis_create_alert(uuid,text,jsonb,text,numeric,text,text), public.atlantis_alert_action(text,text),
  public.atlantis_claim_alerts(uuid), public.atlantis_finish_alert(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.atlantis_claim_alert_search(text,uuid,integer),
  public.atlantis_create_alert(uuid,text,jsonb,text,numeric,text,text), public.atlantis_alert_action(text,text),
  public.atlantis_claim_alerts(uuid), public.atlantis_finish_alert(uuid,uuid,text) to service_role;
