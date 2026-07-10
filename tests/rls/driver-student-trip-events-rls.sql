-- SafeBus Alberta - RLS Regression Tests: Driver Student Trip Events
--
-- Milestone 7B: self-contained DEV/disposable database tests for
-- driver-only pickup/drop-off event RPCs and manifest event state.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.student_trip_events where driver_trip_id in (
  '7b200000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000002',
  '7b200000-0000-0000-0000-000000000003'
);

delete from public.driver_trips where id in (
  '7b200000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000002',
  '7b200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '7b190000-0000-0000-0000-000000000001',
  '7b190000-0000-0000-0000-000000000002',
  '7b190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '7b180000-0000-0000-0000-000000000001',
  '7b180000-0000-0000-0000-000000000002',
  '7b180000-0000-0000-0000-000000000003',
  '7b180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '7b170000-0000-0000-0000-000000000001',
  '7b170000-0000-0000-0000-000000000002',
  '7b170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '7b160000-0000-0000-0000-000000000001',
  '7b160000-0000-0000-0000-000000000002',
  '7b160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '7b150000-0000-0000-0000-000000000001',
  '7b150000-0000-0000-0000-000000000002',
  '7b150000-0000-0000-0000-000000000003'
);

delete from public.guardians where id = '7b140000-0000-0000-0000-000000000001';

delete from public.drivers where id in (
  '7b130000-0000-0000-0000-000000000001',
  '7b130000-0000-0000-0000-000000000002',
  '7b130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '7b120000-0000-0000-0000-000000000001',
  '7b120000-0000-0000-0000-000000000002',
  '7b120000-0000-0000-0000-000000000003',
  '7b120000-0000-0000-0000-000000000004',
  '7b120000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '7b120000-0000-0000-0000-000000000001',
  '7b120000-0000-0000-0000-000000000002',
  '7b120000-0000-0000-0000-000000000003',
  '7b120000-0000-0000-0000-000000000004',
  '7b120000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '7b110000-0000-0000-0000-000000000001',
  '7b110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '7b100000-0000-0000-0000-000000000001',
  '7b100000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('7b100000-0000-0000-0000-000000000001', 'M7B_TEST_Tenant_A', 'school', 'active'),
  ('7b100000-0000-0000-0000-000000000002', 'M7B_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('7b110000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', 'M7B_TEST_School_A', 'AB', 'active'),
  ('7b110000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000002', 'M7B_TEST_School_B', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('7b120000-0000-0000-0000-000000000001', 'm7b_driver_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7b120000-0000-0000-0000-000000000002', 'm7b_driver_other@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7b120000-0000-0000-0000-000000000003', 'm7b_driver_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7b120000-0000-0000-0000-000000000004', 'm7b_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7b120000-0000-0000-0000-000000000005', 'm7b_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('7b120000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', null, 'M7B Driver A', 'm7b_driver_a@test.local', 'driver', 'active'),
  ('7b120000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', null, 'M7B Other Driver', 'm7b_driver_other@test.local', 'driver', 'active'),
  ('7b120000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', null, 'M7B Driver B', 'm7b_driver_b@test.local', 'driver', 'active'),
  ('7b120000-0000-0000-0000-000000000004', '7b100000-0000-0000-0000-000000000001', null, 'M7B Guardian', 'm7b_guardian@test.local', 'guardian', 'active'),
  ('7b120000-0000-0000-0000-000000000005', '7b100000-0000-0000-0000-000000000001', null, 'M7B Admin', 'm7b_admin@test.local', 'tenant_admin', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('7b130000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b120000-0000-0000-0000-000000000001', 'active'),
  ('7b130000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b120000-0000-0000-0000-000000000002', 'active'),
  ('7b130000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', '7b120000-0000-0000-0000-000000000003', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('7b140000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b120000-0000-0000-0000-000000000004', 'M7B Guardian', 'm7b_guardian@test.local', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('7b160000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', 'M7B-BUS-A1', 'active'),
  ('7b160000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', 'M7B-BUS-A2', 'active'),
  ('7b160000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', 'M7B-BUS-B1', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('7b170000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b110000-0000-0000-0000-000000000001', 'M7B Route A Own', 'M7B-A1', 'morning', 'active'),
  ('7b170000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b110000-0000-0000-0000-000000000001', 'M7B Route A Other', 'M7B-A2', 'morning', 'active'),
  ('7b170000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', '7b110000-0000-0000-0000-000000000002', 'M7B Route B CrossTenant', 'M7B-B1', 'morning', 'active');

insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, status)
values
  ('7b180000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b170000-0000-0000-0000-000000000001', 'M7B Own Pickup', 1, 'active'),
  ('7b180000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b170000-0000-0000-0000-000000000001', 'M7B Own Dropoff', 2, 'active'),
  ('7b180000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000001', '7b170000-0000-0000-0000-000000000002', 'M7B Other Pickup', 1, 'active'),
  ('7b180000-0000-0000-0000-000000000004', '7b100000-0000-0000-0000-000000000002', '7b170000-0000-0000-0000-000000000003', 'M7B CrossTenant Pickup', 1, 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('7b150000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b110000-0000-0000-0000-000000000001', 'M7B', 'OwnStudent', 'active'),
  ('7b150000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b110000-0000-0000-0000-000000000001', 'M7B', 'OtherDriverStudent', 'active'),
  ('7b150000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', '7b110000-0000-0000-0000-000000000002', 'M7B', 'CrossTenantStudent', 'active');

insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, status)
values
  ('7b190000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b150000-0000-0000-0000-000000000001', '7b170000-0000-0000-0000-000000000001', '7b180000-0000-0000-0000-000000000001', '7b180000-0000-0000-0000-000000000002', 'active'),
  ('7b190000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b150000-0000-0000-0000-000000000002', '7b170000-0000-0000-0000-000000000002', '7b180000-0000-0000-0000-000000000003', null, 'active'),
  ('7b190000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', '7b150000-0000-0000-0000-000000000003', '7b170000-0000-0000-0000-000000000003', '7b180000-0000-0000-0000-000000000004', null, 'active');

insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('7b200000-0000-0000-0000-000000000001', '7b100000-0000-0000-0000-000000000001', '7b130000-0000-0000-0000-000000000001', '7b160000-0000-0000-0000-000000000001', '7b170000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '20 minutes'),
  ('7b200000-0000-0000-0000-000000000002', '7b100000-0000-0000-0000-000000000001', '7b130000-0000-0000-0000-000000000002', '7b160000-0000-0000-0000-000000000002', '7b170000-0000-0000-0000-000000000002', 'morning', 'active', current_date, now() - interval '15 minutes'),
  ('7b200000-0000-0000-0000-000000000003', '7b100000-0000-0000-0000-000000000002', '7b130000-0000-0000-0000-000000000003', '7b160000-0000-0000-0000-000000000003', '7b170000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '10 minutes');

-- TEST 1: A driver can record pickup for an assigned student on their own active trip.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_status text;
begin
  perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');

  select student_trip_status into v_status
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7b150000-0000-0000-0000-000000000001';

  if v_status <> 'picked_up' then
    raise exception 'TEST 1 FAILED: expected picked_up status, got %', v_status;
  end if;

  raise notice 'TEST 1 PASSED: driver can record pickup';
end
$$;
rollback;

-- TEST 2: A driver can record drop-off only after pickup.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_status text;
begin
  perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
  perform public.mark_student_dropped_off_for_active_trip('7b150000-0000-0000-0000-000000000001');

  select student_trip_status into v_status
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7b150000-0000-0000-0000-000000000001';

  if v_status <> 'dropped_off' then
    raise exception 'TEST 2 FAILED: expected dropped_off status, got %', v_status;
  end if;

  raise notice 'TEST 2 PASSED: driver can record drop-off after pickup';
end
$$;
rollback;

-- TEST 3: A driver cannot drop off before pickup.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.mark_student_dropped_off_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 3 FAILED: drop-off before pickup was allowed';
  exception
    when check_violation then
      raise notice 'TEST 3 PASSED: drop-off before pickup is blocked';
  end;
end
$$;
rollback;

-- TEST 4: Duplicate pickup for the same student/trip is blocked.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 4 FAILED: duplicate pickup was allowed';
  exception
    when unique_violation then
      raise notice 'TEST 4 PASSED: duplicate pickup is blocked';
  end;
end
$$;
rollback;

-- TEST 5: Duplicate drop-off for the same student/trip is blocked.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
  perform public.mark_student_dropped_off_for_active_trip('7b150000-0000-0000-0000-000000000001');
  begin
    perform public.mark_student_dropped_off_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 5 FAILED: duplicate drop-off was allowed';
  exception
    when unique_violation then
      raise notice 'TEST 5 PASSED: duplicate drop-off is blocked';
  end;
end
$$;
rollback;

-- TEST 6: A driver cannot record events for another driver's active-trip student.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000002');
    raise exception 'TEST 6 FAILED: other driver student event was allowed';
  exception
    when no_data_found then
      raise notice 'TEST 6 PASSED: other driver student event is blocked';
  end;
end
$$;
rollback;

-- TEST 7: A driver cannot record events for another tenant's student.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000003');
    raise exception 'TEST 7 FAILED: cross-tenant student event was allowed';
  exception
    when no_data_found then
      raise notice 'TEST 7 PASSED: cross-tenant student event is blocked';
  end;
end
$$;
rollback;

-- TEST 8: Guardian cannot record pickup/drop-off.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
begin
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 8 FAILED: guardian pickup was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 8 PASSED: guardian pickup is blocked';
  end;
end
$$;
rollback;

-- TEST 9: Admin cannot record pickup/drop-off because this is driver-only.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000005';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
begin
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 9 FAILED: admin pickup was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 9 PASSED: admin pickup is blocked';
  end;
end
$$;
rollback;

-- TEST 10: Anonymous access is denied.
begin;
set local role anon;
do $$
begin
  begin
    perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
    raise exception 'TEST 10 FAILED: anon pickup was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 10 PASSED: anon pickup is blocked';
  end;
end
$$;
rollback;

-- TEST 11: Manifest RPC reflects event status after events are recorded.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_status text;
  v_pickup timestamptz;
  v_dropoff timestamptz;
begin
  select student_trip_status into v_status
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7b150000-0000-0000-0000-000000000001';

  if v_status <> 'not_picked_up' then
    raise exception 'TEST 11 FAILED: expected initial not_picked_up, got %', v_status;
  end if;

  perform public.mark_student_picked_up_for_active_trip('7b150000-0000-0000-0000-000000000001');
  perform public.mark_student_dropped_off_for_active_trip('7b150000-0000-0000-0000-000000000001');

  select student_trip_status, pickup_event_time, dropoff_event_time
  into v_status, v_pickup, v_dropoff
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7b150000-0000-0000-0000-000000000001';

  if v_status <> 'dropped_off' or v_pickup is null or v_dropoff is null then
    raise exception 'TEST 11 FAILED: expected dropped_off with event times, got %, %, %',
      v_status, v_pickup, v_dropoff;
  end if;

  raise notice 'TEST 11 PASSED: manifest reflects updated event status';
end
$$;
rollback;

-- TEST 12: Direct browser-style table inserts are blocked.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7b120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7b120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    insert into public.student_trip_events (
      tenant_id,
      driver_trip_id,
      student_id,
      event_type,
      created_by
    )
    values (
      '7b100000-0000-0000-0000-000000000001',
      '7b200000-0000-0000-0000-000000000001',
      '7b150000-0000-0000-0000-000000000001',
      'picked_up',
      '7b120000-0000-0000-0000-000000000001'
    );
    raise exception 'TEST 12 FAILED: direct insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 12 PASSED: direct event table insert is blocked';
  end;
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.student_trip_events where driver_trip_id in (
  '7b200000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000002',
  '7b200000-0000-0000-0000-000000000003'
);

delete from public.driver_trips where id in (
  '7b200000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000002',
  '7b200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '7b190000-0000-0000-0000-000000000001',
  '7b190000-0000-0000-0000-000000000002',
  '7b190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '7b180000-0000-0000-0000-000000000001',
  '7b180000-0000-0000-0000-000000000002',
  '7b180000-0000-0000-0000-000000000003',
  '7b180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '7b170000-0000-0000-0000-000000000001',
  '7b170000-0000-0000-0000-000000000002',
  '7b170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '7b160000-0000-0000-0000-000000000001',
  '7b160000-0000-0000-0000-000000000002',
  '7b160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '7b150000-0000-0000-0000-000000000001',
  '7b150000-0000-0000-0000-000000000002',
  '7b150000-0000-0000-0000-000000000003'
);

delete from public.guardians where id = '7b140000-0000-0000-0000-000000000001';

delete from public.drivers where id in (
  '7b130000-0000-0000-0000-000000000001',
  '7b130000-0000-0000-0000-000000000002',
  '7b130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '7b120000-0000-0000-0000-000000000001',
  '7b120000-0000-0000-0000-000000000002',
  '7b120000-0000-0000-0000-000000000003',
  '7b120000-0000-0000-0000-000000000004',
  '7b120000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '7b120000-0000-0000-0000-000000000001',
  '7b120000-0000-0000-0000-000000000002',
  '7b120000-0000-0000-0000-000000000003',
  '7b120000-0000-0000-0000-000000000004',
  '7b120000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '7b110000-0000-0000-0000-000000000001',
  '7b110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '7b100000-0000-0000-0000-000000000001',
  '7b100000-0000-0000-0000-000000000002'
);
