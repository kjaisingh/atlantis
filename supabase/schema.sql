create table if not exists public.atlantis_route_graph (
  id boolean primary key default true check (id),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.atlantis_route_cache (
  origin text not null,
  destination text not null,
  candidates jsonb not null,
  verified_endpoints jsonb not null default '[]',
  source_period text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (origin, destination)
);

create table if not exists public.atlantis_fare_cache (
  key text primary key,
  owner uuid not null,
  state text not null check (state in ('pending', 'ready', 'failed')),
  result jsonb,
  expires_at timestamptz not null
);

create table if not exists public.atlantis_search_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  calls integer not null check (calls between 1 and 4)
);
create index if not exists atlantis_search_usage_created on public.atlantis_search_usage(created_at);

alter table public.atlantis_route_graph enable row level security;
alter table public.atlantis_route_cache enable row level security;
alter table public.atlantis_fare_cache enable row level security;
alter table public.atlantis_search_usage enable row level security;
revoke all on public.atlantis_route_graph, public.atlantis_route_cache,
  public.atlantis_fare_cache, public.atlantis_search_usage from anon, authenticated;
grant all on public.atlantis_route_graph, public.atlantis_route_cache,
  public.atlantis_fare_cache, public.atlantis_search_usage to service_role;

create or replace function public.atlantis_cache_candidates(
  p_origin text, p_destination text, p_candidates jsonb, p_source_period text
) returns public.atlantis_route_cache language plpgsql security definer set search_path = public as $$
declare v_row public.atlantis_route_cache;
begin
  insert into public.atlantis_route_cache(origin, destination, candidates, source_period)
  values (p_origin, p_destination, p_candidates, p_source_period)
  on conflict (origin, destination) do update set
    candidates = excluded.candidates, verified_endpoints = '[]',
    source_period = excluded.source_period, created_at = now(), expires_at = now() + interval '30 days'
  where atlantis_route_cache.expires_at <= now();
  select * into v_row from public.atlantis_route_cache where origin = p_origin and destination = p_destination;
  return v_row;
end;
$$;

create or replace function public.atlantis_observe_routes(
  p_origin text, p_destination text, p_created_at timestamptz, p_endpoints jsonb
) returns void language sql security definer set search_path = public as $$
  update public.atlantis_route_cache set verified_endpoints = (
    select coalesce(jsonb_agg(distinct value), '[]')
    from jsonb_array_elements(verified_endpoints || p_endpoints)
    where candidates @> jsonb_build_array(value)
  ) where origin = p_origin and destination = p_destination and created_at = p_created_at;
$$;

create or replace function public.atlantis_claim_search(p_key text, p_owner uuid, p_calls integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.atlantis_fare_cache;
  v_daily integer;
  v_monthly integer;
  v_calls integer;
  v_reset timestamptz;
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
  insert into public.atlantis_search_usage(calls) values(p_calls);
  insert into public.atlantis_fare_cache(key, owner, state, expires_at)
    values(p_key, p_owner, 'pending', now() + interval '2 minutes')
    on conflict (key) do update set owner = excluded.owner, state = 'pending', result = null,
      expires_at = excluded.expires_at;
  delete from public.atlantis_search_usage where created_at < now() - interval '32 days';
  delete from public.atlantis_fare_cache where expires_at < now() - interval '1 day';
  return jsonb_build_object('status', 'owner');
end;
$$;

revoke all on function public.atlantis_cache_candidates(text,text,jsonb,text),
  public.atlantis_observe_routes(text,text,timestamptz,jsonb),
  public.atlantis_claim_search(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.atlantis_cache_candidates(text,text,jsonb,text),
  public.atlantis_observe_routes(text,text,timestamptz,jsonb),
  public.atlantis_claim_search(text,uuid,integer) to service_role;

create or replace function public.atlantis_finish_search(
  p_key text, p_owner uuid, p_result jsonb, p_failed boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb := p_result;
  v_expires timestamptz;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or p_failed is null then
    raise exception 'Invalid search completion';
  end if;
  v_expires := now() + case when p_failed or coalesce((p_result #>> '{meta,failed}')::integer, 0) > 0
    then interval '1 minute' else interval '10 minutes' end;
  if not p_failed then
    v_result := jsonb_set(v_result, '{meta,fareExpiresAt}', to_jsonb(v_expires));
  end if;
  update public.atlantis_fare_cache set
    state = case when p_failed then 'failed' else 'ready' end,
    result = v_result, expires_at = v_expires
  where key = p_key and owner = p_owner and state = 'pending' and expires_at > now();
  if not found then return null; end if;
  return v_result;
end;
$$;

create or replace function public.atlantis_readiness()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_graph public.atlantis_route_graph;
begin
  select * into v_graph from public.atlantis_route_graph where id = true;
  if not found or jsonb_typeof(v_graph.data->'edges') is distinct from 'array' then
    return jsonb_build_object('ready', false);
  end if;
  perform 1 from public.atlantis_route_cache limit 1;
  perform 1 from public.atlantis_fare_cache limit 1;
  perform 1 from public.atlantis_search_usage limit 1;
  return jsonb_build_object('ready', jsonb_array_length(v_graph.data->'edges') > 0,
    'sourcePeriod', v_graph.data->>'period', 'updatedAt', v_graph.updated_at);
end;
$$;

revoke all on function public.atlantis_finish_search(text,uuid,jsonb,boolean),
  public.atlantis_readiness() from public, anon, authenticated;
grant execute on function public.atlantis_finish_search(text,uuid,jsonb,boolean),
  public.atlantis_readiness() to service_role;
