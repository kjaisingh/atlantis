do $$
declare
  first_row atlantis_route_cache;
  next_row atlantis_route_cache;
  claim jsonb;
  i integer;
  v_owner uuid := gen_random_uuid();
  completed jsonb;
begin
  first_row := atlantis_cache_candidates('JFK', 'DTW', '["ORD"]', '2026-07');
  next_row := atlantis_cache_candidates('JFK', 'DTW', '["ATL"]', '2026-08');
  assert next_row.candidates = '["ORD"]'::jsonb, 'Fresh candidates changed';
  assert next_row.created_at = first_row.created_at, 'Creation moved';
  assert next_row.expires_at = first_row.created_at + interval '30 days', 'Expiry is not fixed';
  perform atlantis_observe_routes('JFK', 'DTW', first_row.created_at, '["ORD", "BOS"]');
  select * into next_row from atlantis_route_cache;
  assert next_row.verified_endpoints = '["ORD"]'::jsonb, 'Unqueried endpoint accepted';
  assert next_row.expires_at = first_row.expires_at, 'Observation extended expiry';
  perform atlantis_observe_routes('JFK', 'DTW', first_row.created_at - interval '1 day', '["ORD"]');
  update atlantis_route_cache set expires_at = now();
  next_row := atlantis_cache_candidates('JFK', 'DTW', '["ATL"]', '2026-08');
  assert next_row.candidates = '["ATL"]'::jsonb, 'Expired candidates not refreshed';
  assert next_row.verified_endpoints = '[]'::jsonb, 'Old observations not reset';

  claim := atlantis_claim_search(repeat('a',64), gen_random_uuid(), 4);
  assert claim->>'status' = 'owner', 'Initial claim rejected';
  claim := atlantis_claim_search(repeat('a',64), gen_random_uuid(), 4);
  assert claim->>'status' = 'pending', 'Duplicate claim reserved twice';
  assert (select count(*) from atlantis_search_usage) = 1;
  for i in 1..9 loop
    perform atlantis_claim_search(lpad(to_hex(i),64,'0'), gen_random_uuid(), 4);
  end loop;
  claim := atlantis_claim_search(repeat('b',64), gen_random_uuid(), 4);
  assert claim->>'code' = 'daily_limit', 'Daily cap bypassed';
  update atlantis_fare_cache set state = 'ready', result = '{"itineraries":[]}' where key = repeat('a',64);
  claim := atlantis_claim_search(repeat('a',64), gen_random_uuid(), 4);
  assert claim->>'status' = 'ready', 'Cache blocked by quota';
  update atlantis_search_usage set created_at = now() - interval '2 days';
  insert into atlantis_search_usage(calls, created_at) select 4, now() - interval '2 days' from generate_series(1,40);
  claim := atlantis_claim_search(repeat('b',64), gen_random_uuid(), 4);
  assert claim->>'code' = 'monthly_limit', 'Monthly cap bypassed';
  assert (select sum(calls) from atlantis_search_usage) = 200;
  update atlantis_search_usage set created_at = now() - interval '31 days';
  claim := atlantis_claim_search(repeat('b',64), gen_random_uuid(), 4);
  assert claim->>'status' = 'owner', 'Quota did not reset';
  assert not has_function_privilege('anon', 'atlantis_claim_search(text,uuid,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'atlantis_cache_candidates(text,text,jsonb,text)', 'EXECUTE');
  assert has_function_privilege('service_role', 'atlantis_claim_search(text,uuid,integer)', 'EXECUTE');
  assert not has_table_privilege('anon', 'atlantis_route_cache', 'SELECT');

  perform atlantis_claim_search(repeat('c',64), v_owner, 4);
  completed := atlantis_finish_search(repeat('c',64), gen_random_uuid(), '{"itineraries":[],"meta":{"failed":0}}');
  assert completed is null, 'Another owner completed a search';
  completed := atlantis_finish_search(repeat('c',64), v_owner, '{"itineraries":[],"meta":{"failed":0}}');
  assert (completed #>> '{meta,fareExpiresAt}')::timestamptz = now() + interval '10 minutes';
  assert (select expires_at from atlantis_fare_cache where key = repeat('c',64)) = now() + interval '10 minutes';
  assert atlantis_finish_search(repeat('c',64), v_owner, '{"meta":{"failed":0}}') is null, 'Finished search overwritten';

  perform atlantis_claim_search(repeat('d',64), v_owner, 4);
  completed := atlantis_finish_search(repeat('d',64), v_owner, '{"itineraries":[],"meta":{"failed":1}}');
  assert (completed #>> '{meta,fareExpiresAt}')::timestamptz = now() + interval '1 minute';
  perform atlantis_claim_search(repeat('e',64), v_owner, 4);
  perform atlantis_finish_search(repeat('e',64), v_owner, '{"status":429,"code":"provider_limit","message":"Quota exhausted"}', true);
  claim := atlantis_claim_search(repeat('e',64), gen_random_uuid(), 4);
  assert claim->>'status' = 'failed';
  assert claim #>> '{result,status}' = '429', 'Cached failure lost status';
  assert (select expires_at from atlantis_fare_cache where key = repeat('e',64)) = now() + interval '1 minute';

  perform atlantis_claim_search(repeat('f',64), v_owner, 4);
  update atlantis_fare_cache set expires_at = now() where key = repeat('f',64);
  assert atlantis_finish_search(repeat('f',64), v_owner, '{"meta":{"failed":0}}') is null, 'Expired lease completed';
  assert (atlantis_readiness()->>'ready')::boolean = false, 'Missing graph reported ready';
  insert into atlantis_route_graph(data) values ('{"edges":[["JFK","DTW","DL",100]],"period":"2026-07"}');
  assert (atlantis_readiness()->>'ready')::boolean = true;
  assert not has_function_privilege('anon', 'atlantis_finish_search(text,uuid,jsonb,boolean)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'atlantis_readiness()', 'EXECUTE');
end;
$$;
