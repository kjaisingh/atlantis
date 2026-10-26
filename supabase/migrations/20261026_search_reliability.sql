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
