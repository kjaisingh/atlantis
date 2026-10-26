do $$
declare
  first_row atlantis_route_cache;
  next_row atlantis_route_cache;
  claim jsonb;
  i integer;
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
end;
$$;
