-- SafeBus Alberta - RLS Regression Tests: Driver Active Trip Student Manifest
--
-- Milestone 7A: self-contained DEV/disposable database tests for
-- public.get_driver_active_trip_student_manifest().

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.driver_trips where id in (
  '7a200000-0000-0000-0000-000000000001',
  '7a200000-0000-0000-0000-000000000002',
  '7a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '7a190000-0000-0000-0000-000000000001',
  '7a190000-0000-0000-0000-000000000002',
  '7a190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '7a180000-0000-0000-0000-000000000001',
  '7a180000-0000-0000-0000-000000000002',
  '7a180000-0000-0000-0000-000000000003',
  '7a180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '7a170000-0000-0000-0000-000000000001',
  '7a170000-0000-0000-0000-000000000002',
  '7a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '7a160000-0000-0000-0000-000000000001',
  '7a160000-0000-0000-0000-000000000002',
  '7a160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '7a150000-0000-0000-0000-000000000001',
  '7a150000-0000-0000-0000-000000000002',
  '7a150000-0000-0000-0000-000000000003'
);

delete from public.guardians where id = '7a140000-0000-0000-0000-000000000001';

delete from public.drivers where id in (
  '7a130000-0000-0000-0000-000000000001',
  '7a130000-0000-0000-0000-000000000002',
  '7a130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '7a120000-0000-0000-0000-000000000001',
  '7a120000-0000-0000-0000-000000000002',
  '7a120000-0000-0000-0000-000000000003',
  '7a120000-0000-0000-0000-000000000004',
  '7a120000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '7a120000-0000-0000-0000-000000000001',
  '7a120000-0000-0000-0000-000000000002',
  '7a120000-0000-0000-0000-000000000003',
  '7a120000-0000-0000-0000-000000000004',
  '7a120000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '7a110000-0000-0000-0000-000000000001',
  '7a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '7a100000-0000-0000-0000-000000000001',
  '7a100000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('7a100000-0000-0000-0000-000000000001', 'M7A_TEST_Tenant_A', 'school', 'active'),
  ('7a100000-0000-0000-0000-000000000002', 'M7A_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('7a110000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', 'M7A_TEST_School_A', 'AB', 'active'),
  ('7a110000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000002', 'M7A_TEST_School_B', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('7a120000-0000-0000-0000-000000000001', 'm7a_driver_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7a120000-0000-0000-0000-000000000002', 'm7a_driver_other@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7a120000-0000-0000-0000-000000000003', 'm7a_driver_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7a120000-0000-0000-0000-000000000004', 'm7a_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('7a120000-0000-0000-0000-000000000005', 'm7a_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('7a120000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', null, 'M7A Driver A', 'm7a_driver_a@test.local', 'driver', 'active'),
  ('7a120000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', null, 'M7A Other Driver', 'm7a_driver_other@test.local', 'driver', 'active'),
  ('7a120000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', null, 'M7A Driver B', 'm7a_driver_b@test.local', 'driver', 'active'),
  ('7a120000-0000-0000-0000-000000000004', '7a100000-0000-0000-0000-000000000001', null, 'M7A Guardian', 'm7a_guardian@test.local', 'guardian', 'active'),
  ('7a120000-0000-0000-0000-000000000005', '7a100000-0000-0000-0000-000000000001', null, 'M7A Admin', 'm7a_admin@test.local', 'tenant_admin', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('7a130000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a120000-0000-0000-0000-000000000001', 'active'),
  ('7a130000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a120000-0000-0000-0000-000000000002', 'active'),
  ('7a130000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', '7a120000-0000-0000-0000-000000000003', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('7a140000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a120000-0000-0000-0000-000000000004', 'M7A Guardian', 'm7a_guardian@test.local', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('7a160000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', 'M7A-BUS-A1', 'active'),
  ('7a160000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', 'M7A-BUS-A2', 'active'),
  ('7a160000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', 'M7A-BUS-B1', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('7a170000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a110000-0000-0000-0000-000000000001', 'M7A Route A Own', 'M7A-A1', 'morning', 'active'),
  ('7a170000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a110000-0000-0000-0000-000000000001', 'M7A Route A Other', 'M7A-A2', 'morning', 'active'),
  ('7a170000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', '7a110000-0000-0000-0000-000000000002', 'M7A Route B CrossTenant', 'M7A-B1', 'morning', 'active');

insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, status)
values
  ('7a180000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a170000-0000-0000-0000-000000000001', 'M7A Own Pickup', 1, 'active'),
  ('7a180000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a170000-0000-0000-0000-000000000001', 'M7A Own Dropoff', 2, 'active'),
  ('7a180000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000001', '7a170000-0000-0000-0000-000000000002', 'M7A Other Pickup SHOULD NOT LEAK', 1, 'active'),
  ('7a180000-0000-0000-0000-000000000004', '7a100000-0000-0000-0000-000000000002', '7a170000-0000-0000-0000-000000000003', 'M7A CrossTenant Pickup SHOULD NOT LEAK', 1, 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('7a150000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a110000-0000-0000-0000-000000000001', 'M7A', 'OwnStudent', 'active'),
  ('7a150000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a110000-0000-0000-0000-000000000001', 'M7A', 'OtherDriverStudent', 'active'),
  ('7a150000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', '7a110000-0000-0000-0000-000000000002', 'M7A', 'CrossTenantStudent', 'active');

insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, status)
values
  ('7a190000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a150000-0000-0000-0000-000000000001', '7a170000-0000-0000-0000-000000000001', '7a180000-0000-0000-0000-000000000001', '7a180000-0000-0000-0000-000000000002', 'active'),
  ('7a190000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a150000-0000-0000-0000-000000000002', '7a170000-0000-0000-0000-000000000002', '7a180000-0000-0000-0000-000000000003', null, 'active'),
  ('7a190000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', '7a150000-0000-0000-0000-000000000003', '7a170000-0000-0000-0000-000000000003', '7a180000-0000-0000-0000-000000000004', null, 'active');

insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('7a200000-0000-0000-0000-000000000001', '7a100000-0000-0000-0000-000000000001', '7a130000-0000-0000-0000-000000000001', '7a160000-0000-0000-0000-000000000001', '7a170000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '20 minutes'),
  ('7a200000-0000-0000-0000-000000000002', '7a100000-0000-0000-0000-000000000001', '7a130000-0000-0000-0000-000000000002', '7a160000-0000-0000-0000-000000000002', '7a170000-0000-0000-0000-000000000002', 'morning', 'active', current_date, now() - interval '15 minutes'),
  ('7a200000-0000-0000-0000-000000000003', '7a100000-0000-0000-0000-000000000002', '7a130000-0000-0000-0000-000000000003', '7a160000-0000-0000-0000-000000000003', '7a170000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '10 minutes');

-- TEST 1: A driver sees only students assigned to their own active trip route.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
  v_pickup text;
  v_dropoff text;
begin
  if auth.uid() <> '7a120000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed';
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 1 FAILED: expected driver, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[]),
         max(pickup_stop_name),
         max(dropoff_stop_name)
  into v_ids, v_pickup, v_dropoff
  from public.get_driver_active_trip_student_manifest()
  where student_id is not null;

  if v_ids <> array['7a150000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'TEST 1 FAILED: expected only own route student, got %', v_ids;
  end if;
  if v_pickup <> 'M7A Own Pickup' or v_dropoff <> 'M7A Own Dropoff' then
    raise exception 'TEST 1 FAILED: expected own stop labels, got %, %', v_pickup, v_dropoff;
  end if;

  raise notice 'TEST 1 PASSED: driver sees own active trip manifest only';
end
$$;
rollback;

-- TEST 2: Same-tenant other driver's active trip students are hidden.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7a150000-0000-0000-0000-000000000002';

  if v_count <> 0 then
    raise exception 'TEST 2 FAILED: saw another driver student rows: %', v_count;
  end if;

  raise notice 'TEST 2 PASSED: same-tenant other driver students are hidden';
end
$$;
rollback;

-- TEST 3: Cross-tenant students are hidden.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.get_driver_active_trip_student_manifest()
  where student_id = '7a150000-0000-0000-0000-000000000003';

  if v_count <> 0 then
    raise exception 'TEST 3 FAILED: saw cross-tenant student rows: %', v_count;
  end if;

  raise notice 'TEST 3 PASSED: cross-tenant students are hidden';
end
$$;
rollback;

-- TEST 4: Guardian receives no driver manifest data.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7a120000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7a120000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 4 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_driver_active_trip_student_manifest();

  if v_count <> 0 then
    raise exception 'TEST 4 FAILED: guardian received % manifest rows', v_count;
  end if;

  raise notice 'TEST 4 PASSED: guardian receives no driver manifest data';
end
$$;
rollback;

-- TEST 5: Admin receives no driver manifest data.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '7a120000-0000-0000-0000-000000000005';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"7a120000-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 5 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_driver_active_trip_student_manifest();

  if v_count <> 0 then
    raise exception 'TEST 5 FAILED: admin received % manifest rows', v_count;
  end if;

  raise notice 'TEST 5 PASSED: admin receives no driver manifest data';
end
$$;
rollback;

-- TEST 6: Anonymous access is denied, or returns zero rows if the body guard runs.
begin;
set local role anon;
do $$
declare
  v_count int;
begin
  if auth.uid() is not null then
    raise exception 'TEST 6 FAILED: expected anon auth.uid() NULL, got %', auth.uid();
  end if;

  begin
    select count(*) into v_count from public.get_driver_active_trip_student_manifest();
    if v_count <> 0 then
      raise exception 'TEST 6 FAILED: anon got % manifest rows', v_count;
    end if;
    raise notice 'TEST 6 PASSED: anon got zero rows from driver manifest RPC';
  exception
    when insufficient_privilege then
      raise notice 'TEST 6 PASSED: anon blocked from executing driver manifest RPC';
  end;
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.driver_trips where id in (
  '7a200000-0000-0000-0000-000000000001',
  '7a200000-0000-0000-0000-000000000002',
  '7a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '7a190000-0000-0000-0000-000000000001',
  '7a190000-0000-0000-0000-000000000002',
  '7a190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '7a180000-0000-0000-0000-000000000001',
  '7a180000-0000-0000-0000-000000000002',
  '7a180000-0000-0000-0000-000000000003',
  '7a180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '7a170000-0000-0000-0000-000000000001',
  '7a170000-0000-0000-0000-000000000002',
  '7a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '7a160000-0000-0000-0000-000000000001',
  '7a160000-0000-0000-0000-000000000002',
  '7a160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '7a150000-0000-0000-0000-000000000001',
  '7a150000-0000-0000-0000-000000000002',
  '7a150000-0000-0000-0000-000000000003'
);

delete from public.guardians where id = '7a140000-0000-0000-0000-000000000001';

delete from public.drivers where id in (
  '7a130000-0000-0000-0000-000000000001',
  '7a130000-0000-0000-0000-000000000002',
  '7a130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '7a120000-0000-0000-0000-000000000001',
  '7a120000-0000-0000-0000-000000000002',
  '7a120000-0000-0000-0000-000000000003',
  '7a120000-0000-0000-0000-000000000004',
  '7a120000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '7a120000-0000-0000-0000-000000000001',
  '7a120000-0000-0000-0000-000000000002',
  '7a120000-0000-0000-0000-000000000003',
  '7a120000-0000-0000-0000-000000000004',
  '7a120000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '7a110000-0000-0000-0000-000000000001',
  '7a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '7a100000-0000-0000-0000-000000000001',
  '7a100000-0000-0000-0000-000000000002'
);
