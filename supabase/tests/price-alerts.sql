truncate atlantis_search_usage, atlantis_fare_cache;
do $$
declare
  v_id uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_trip jsonb := '{"origin":"JFK","destination":"DTW","departureDate":"2099-02-28","returnDate":"","travelers":1}';
  v_row atlantis_price_alerts;
  v_claim jsonb;
  i integer;
begin
  v_row := atlantis_create_alert(v_id, 'test@example.com', v_trip, 'trip', 200, repeat('a',64), repeat('b',64));
  assert v_row.state = 'pending';
  assert (select count(*) from atlantis_claim_alerts(v_owner)) = 0, 'Unconfirmed alert claimed';
  v_row := atlantis_create_alert(gen_random_uuid(), 'test@example.com', v_trip, 'trip', 300, repeat('c',64), repeat('d',64));
  assert v_row.id is null, 'Duplicate signup created';
  assert atlantis_alert_action(repeat('a',64), 'verify');
  assert atlantis_alert_action(repeat('a',64), 'verify'), 'Verification not idempotent';
  assert (select count(*) from atlantis_claim_alerts(v_owner)) = 1;
  assert (select count(*) from atlantis_claim_alerts(v_other)) = 0, 'Concurrent worker claimed leased alert';
  assert not atlantis_finish_alert(v_id, v_other, 'prepare'), 'Wrong worker prepared email';
  assert atlantis_finish_alert(v_id, v_owner, 'prepare');
  assert not atlantis_finish_alert(v_id, v_owner, 'prepare'), 'Email prepared twice';
  assert atlantis_finish_alert(v_id, v_owner, 'notified');
  assert (select email is null and verify_hash is null and unsubscribe_hash is null from atlantis_price_alerts where id = v_id), 'Completed alert retained recipient';
  assert (select count(*) from atlantis_claim_alerts(v_owner)) = 0, 'Completed alert reclaimed';

  v_id := gen_random_uuid();
  perform atlantis_create_alert(v_id, 'test@example.com', v_trip, 'trip', 200, repeat('e',64), repeat('f',64));
  perform atlantis_alert_action(repeat('e',64), 'verify');
  perform atlantis_claim_alerts(v_owner);
  perform atlantis_alert_action(repeat('f',64), 'unsubscribe');
  assert not atlantis_finish_alert(v_id,v_owner,'prepare'), 'Unsubscribe lost to pending send';

  v_id := gen_random_uuid();
  perform atlantis_create_alert(v_id, 'test@example.com', v_trip, 'trip', 200, repeat('e',64), repeat('f',64));
  perform atlantis_alert_action(repeat('e',64), 'verify');
  perform atlantis_claim_alerts(v_owner);
  perform atlantis_finish_alert(v_id,v_owner,'prepare');
  update atlantis_price_alerts set lease_until = now() where id = v_id;
  perform atlantis_claim_alerts(v_other);
  assert (select state = 'unknown' and email is null from atlantis_price_alerts where id = v_id), 'Crashed delivery was not quarantined';

  v_id := gen_random_uuid();
  perform atlantis_create_alert(v_id, 'test@example.com', v_trip, 'trip', 200, repeat('e',64), repeat('f',64));
  update atlantis_price_alerts set verify_expires_at = now() where id = v_id;
  assert not atlantis_alert_action(repeat('e',64), 'verify'), 'Expired verification accepted';
  perform atlantis_claim_alerts(v_owner);
  assert (select state = 'expired' and email is null from atlantis_price_alerts where id = v_id);

  v_id := gen_random_uuid();
  perform atlantis_create_alert(v_id, 'test@example.com', v_trip, 'trip', 200, repeat('e',64), repeat('f',64));
  perform atlantis_create_alert(gen_random_uuid(), 'second@example.com', v_trip, 'trip', 200, repeat('1',64), repeat('2',64));
  perform atlantis_alert_action(repeat('e',64), 'verify');
  perform atlantis_alert_action(repeat('1',64), 'verify');
  assert (select count(*) from atlantis_claim_alerts(v_owner)) = 2, 'Identical trips not grouped';
  perform atlantis_finish_alert(v_id,v_owner,'checked');
  assert (select next_check_at = now() + interval '7 days' from atlantis_price_alerts where id = v_id), 'Weekly interval not preserved';
  update atlantis_price_alerts set trip = jsonb_set(trip,'{departureDate}',to_jsonb('2000-01-01'::text)), next_check_at=now() where id=v_id;
  perform atlantis_claim_alerts(v_other);
  assert (select state='expired' and email is null from atlantis_price_alerts where id=v_id), 'Departed alert not expired';
  perform atlantis_claim_alert_search(repeat('d',64),v_owner,4);
  perform atlantis_claim_alert_search(repeat('e',64),v_owner,4);
  v_claim := atlantis_claim_alert_search(repeat('f',64),v_owner,4);
  assert v_claim->>'code' = 'alert_limit', 'Daily alert cap bypassed';
  truncate atlantis_search_usage, atlantis_fare_cache;

  for i in 1..20 loop
    v_claim := atlantis_claim_alert_search(lpad(to_hex(i),64,'0'), v_owner, 4);
    assert v_claim->>'status' = 'owner';
    update atlantis_search_usage set created_at = now() - interval '2 days';
  end loop;
  v_claim := atlantis_claim_alert_search(repeat('b',64),v_owner,4);
  assert v_claim->>'code' = 'alert_limit', 'Alert quota exceeded';
  update atlantis_fare_cache set state='ready',result='{"itineraries":[]}' where key=lpad(to_hex(1),64,'0');
  v_claim := atlantis_claim_alert_search(lpad(to_hex(1),64,'0'),v_owner,4);
  assert v_claim->>'status' = 'ready', 'Alert cache blocked by quota';
  for i in 21..50 loop
    v_claim := atlantis_claim_search(lpad(to_hex(i),64,'0'),v_owner,4);
    assert v_claim->>'status' = 'owner', 'Interactive reserve unavailable';
    update atlantis_search_usage set created_at = now() - interval '2 days';
  end loop;
  assert (select sum(calls) from atlantis_search_usage where source='interactive') = 120;
  v_claim := atlantis_claim_search(repeat('c',64),v_owner,4);
  assert v_claim->>'code' = 'monthly_limit', 'Global quota bypassed';
  assert not has_table_privilege('anon','atlantis_price_alerts','SELECT');
  assert not has_function_privilege('anon','atlantis_alert_action(text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','atlantis_claim_alerts(uuid)','EXECUTE');
  assert has_function_privilege('service_role','atlantis_finish_alert(uuid,uuid,text)','EXECUTE');
end;
$$;
