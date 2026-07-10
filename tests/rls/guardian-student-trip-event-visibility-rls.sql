-- SafeBus Alberta - RLS Regression Tests: Guardian Student Trip Event Visibility
--
-- Milestone 8A: self-contained DEV/disposable database tests for
-- public.get_guardian_student_trip_event_visibility().

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.student_trip_events where driver_trip_id in (
  '8a200000-0000-0000-0000-000000000001',
  '8a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trips where id in (
  '8a200000-0000-0000-0000-000000000001',
  '8a200000-0000-0000-0000-000000000002'
);

delete from public.student_route_assignments where id in (
  '8a190000-0000-0000-0000-000000000001',
  '8a190000-0000-0000-0000-000000000002',
  '8a190000-0000-0000-0000-000000000003',
  '8a190000-0000-0000-0000-000000000004',
  '8a190000-0000-0000-0000-000000000005'
);

delete from public.route_stops where id in (
  '8a180000-0000-0000-0000-000000000001',
  '8a180000-0000-0000-0000-000000000002',
  '8a180000-0000-0000-0000-000000000003',
  '8a180000-0000-0000-0000-000000000004',
  '8a180000-0000-0000-0000-000000000005',
  '8a180000-0000-0000-0000-000000000006'
);

delete from public.routes where id in (
  '8a170000-0000-0000-0000-000000000001',
  '8a170000-0000-0000-0000-000000000002',
  '8a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '8a160000-0000-0000-0000-000000000001',
  '8a160000-0000-0000-0000-000000000002'
);

delete from public.student_guardians where id in (
  '8a155000-0000-0000-0000-000000000001',
  '8a155000-0000-0000-0000-000000000002',
  '8a155000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '8a150000-0000-0000-0000-000000000001',
  '8a150000-0000-0000-0000-000000000002',
  '8a150000-0000-0000-0000-000000000003',
  '8a150000-0000-0000-0000-000000000004',
  '8a150000-0000-0000-0000-000000000005'
);

delete from public.guardians where id in (
  '8a140000-0000-0000-0000-000000000001',
  '8a140000-0000-0000-0000-000000000002',
  '8a140000-0000-0000-0000-000000000003'
);

delete from public.drivers where id in (
  '8a130000-0000-0000-0000-000000000001',
  '8a130000-0000-0000-0000-000000000002'
);

delete from public.profiles where id in (
  '8a120000-0000-0000-0000-000000000001',
  '8a120000-0000-0000-0000-000000000002',
  '8a120000-0000-0000-0000-000000000003',
  '8a120000-0000-0000-0000-000000000004',
  '8a120000-0000-0000-0000-000000000005',
  '8a120000-0000-0000-0000-000000000006',
  '8a120000-0000-0000-0000-000000000007'
);

delete from auth.users where id in (
  '8a120000-0000-0000-0000-000000000001',
  '8a120000-0000-0000-0000-000000000002',
  '8a120000-0000-0000-0000-000000000003',
  '8a120000-0000-0000-0000-000000000004',
  '8a120000-0000-0000-0000-000000000005',
  '8a120000-0000-0000-0000-000000000006',
  '8a120000-0000-0000-0000-000000000007'
);

delete from public.schools where id in (
  '8a110000-0000-0000-0000-000000000001',
  '8a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '8a100000-0000-0000-0000-000000000001',
  '8a100000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('8a100000-0000-0000-0000-000000000001', 'M8A_TEST_Tenant_A', 'school', 'active'),
  ('8a100000-0000-0000-0000-000000000002', 'M8A_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('8a110000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', 'M8A_TEST_School_A', 'AB', 'active'),
  ('8a110000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000002', 'M8A_TEST_School_B', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('8a120000-0000-0000-0000-000000000001', 'm8a_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000002', 'm8a_guardian_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000003', 'm8a_guardian_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000004', 'm8a_driver_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000005', 'm8a_guardian_c@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000006', 'm8a_driver_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8a120000-0000-0000-0000-000000000007', 'm8a_transport_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('8a120000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A Tenant Admin', 'm8a_admin@test.local', 'tenant_admin', 'active'),
  ('8a120000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', null, 'M8A Guardian A', 'm8a_guardian_a@test.local', 'guardian', 'active'),
  ('8a120000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000001', null, 'M8A Guardian B', 'm8a_guardian_b@test.local', 'guardian', 'active'),
  ('8a120000-0000-0000-0000-000000000004', '8a100000-0000-0000-0000-000000000001', null, 'M8A Driver A', 'm8a_driver_a@test.local', 'driver', 'active'),
  ('8a120000-0000-0000-0000-000000000005', '8a100000-0000-0000-0000-000000000002', null, 'M8A Guardian C', 'm8a_guardian_c@test.local', 'guardian', 'active'),
  ('8a120000-0000-0000-0000-000000000006', '8a100000-0000-0000-0000-000000000002', null, 'M8A Driver B', 'm8a_driver_b@test.local', 'driver', 'active'),
  ('8a120000-0000-0000-0000-000000000007', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A Transportation Admin', 'm8a_transport_admin@test.local', 'transportation_admin', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('8a140000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a120000-0000-0000-0000-000000000002', 'M8A Guardian A', 'm8a_guardian_a@test.local', 'active'),
  ('8a140000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a120000-0000-0000-0000-000000000003', 'M8A Guardian B', 'm8a_guardian_b@test.local', 'active'),
  ('8a140000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000002', '8a120000-0000-0000-0000-000000000005', 'M8A Guardian C', 'm8a_guardian_c@test.local', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('8a130000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a120000-0000-0000-0000-000000000004', 'active'),
  ('8a130000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000002', '8a120000-0000-0000-0000-000000000006', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('8a160000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', 'M8A-BUS-A', 'active'),
  ('8a160000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000002', 'M8A-BUS-B', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('8a170000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A Route Active', 'M8A-ACT', 'morning', 'active'),
  ('8a170000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A Route No Trip', 'M8A-NO', 'afternoon', 'active'),
  ('8a170000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000002', '8a110000-0000-0000-0000-000000000002', 'M8A Route CrossTenant', 'M8A-XT', 'morning', 'active');

insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, status)
values
  ('8a180000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000001', 'M8A Active Pickup', 1, 'active'),
  ('8a180000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000001', 'M8A Active Dropoff', 2, 'active'),
  ('8a180000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000002', 'M8A NoTrip Pickup', 1, 'active'),
  ('8a180000-0000-0000-0000-000000000004', '8a100000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000002', 'M8A NoTrip Dropoff', 2, 'active'),
  ('8a180000-0000-0000-0000-000000000005', '8a100000-0000-0000-0000-000000000002', '8a170000-0000-0000-0000-000000000003', 'M8A Cross Pickup', 1, 'active'),
  ('8a180000-0000-0000-0000-000000000006', '8a100000-0000-0000-0000-000000000002', '8a170000-0000-0000-0000-000000000003', 'M8A Cross Dropoff', 2, 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('8a150000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A', 'OwnActiveTrip', 'active'),
  ('8a150000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A', 'OwnNoTrip', 'active'),
  ('8a150000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A', 'GuardianBStudent', 'active'),
  ('8a150000-0000-0000-0000-000000000004', '8a100000-0000-0000-0000-000000000001', '8a110000-0000-0000-0000-000000000001', 'M8A', 'UnlinkedStudent', 'active'),
  ('8a150000-0000-0000-0000-000000000005', '8a100000-0000-0000-0000-000000000002', '8a110000-0000-0000-0000-000000000002', 'M8A', 'CrossTenantStudent', 'active');

insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values
  ('8a155000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000001', '8a140000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('8a155000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000002', '8a140000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('8a155000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000003', '8a140000-0000-0000-0000-000000000002', 'guardian', 'active');

insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, status)
values
  ('8a190000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000001', '8a180000-0000-0000-0000-000000000001', '8a180000-0000-0000-0000-000000000002', 'active'),
  ('8a190000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000002', '8a170000-0000-0000-0000-000000000002', '8a180000-0000-0000-0000-000000000003', '8a180000-0000-0000-0000-000000000004', 'active'),
  ('8a190000-0000-0000-0000-000000000003', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000003', '8a170000-0000-0000-0000-000000000002', '8a180000-0000-0000-0000-000000000003', '8a180000-0000-0000-0000-000000000004', 'active'),
  ('8a190000-0000-0000-0000-000000000004', '8a100000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000004', '8a170000-0000-0000-0000-000000000001', '8a180000-0000-0000-0000-000000000001', '8a180000-0000-0000-0000-000000000002', 'active'),
  ('8a190000-0000-0000-0000-000000000005', '8a100000-0000-0000-0000-000000000002', '8a150000-0000-0000-0000-000000000005', '8a170000-0000-0000-0000-000000000003', '8a180000-0000-0000-0000-000000000005', '8a180000-0000-0000-0000-000000000006', 'active');

insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('8a200000-0000-0000-0000-000000000001', '8a100000-0000-0000-0000-000000000001', '8a130000-0000-0000-0000-000000000001', '8a160000-0000-0000-0000-000000000001', '8a170000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '20 minutes'),
  ('8a200000-0000-0000-0000-000000000002', '8a100000-0000-0000-0000-000000000002', '8a130000-0000-0000-0000-000000000002', '8a160000-0000-0000-0000-000000000002', '8a170000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '10 minutes');

insert into public.student_trip_events (tenant_id, driver_trip_id, student_id, event_type, event_time, created_by)
values
  ('8a100000-0000-0000-0000-000000000002', '8a200000-0000-0000-0000-000000000002', '8a150000-0000-0000-0000-000000000005', 'picked_up', now() - interval '8 minutes', '8a120000-0000-0000-0000-000000000006'),
  ('8a100000-0000-0000-0000-000000000002', '8a200000-0000-0000-0000-000000000002', '8a150000-0000-0000-0000-000000000005', 'dropped_off', now() - interval '3 minutes', '8a120000-0000-0000-0000-000000000006');

-- TEST 1: Guardian sees exactly own linked students and initial statuses.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
  v_active_status text;
  v_no_trip_status text;
begin
  if auth.uid() <> '8a120000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 1 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_ids
  from public.get_guardian_student_trip_event_visibility();

  if v_ids <> array[
    '8a150000-0000-0000-0000-000000000001'::uuid,
    '8a150000-0000-0000-0000-000000000002'::uuid
  ] then
    raise exception 'TEST 1 FAILED: expected only Guardian A linked students, got %', v_ids;
  end if;

  select student_trip_status into v_active_status
  from public.get_guardian_student_trip_event_visibility()
  where student_id = '8a150000-0000-0000-0000-000000000001';

  select student_trip_status into v_no_trip_status
  from public.get_guardian_student_trip_event_visibility()
  where student_id = '8a150000-0000-0000-0000-000000000002';

  if v_active_status <> 'not_picked_up' then
    raise exception 'TEST 1 FAILED: expected not_picked_up before events, got %', v_active_status;
  end if;
  if v_no_trip_status <> 'no_active_trip' then
    raise exception 'TEST 1 FAILED: expected no_active_trip, got %', v_no_trip_status;
  end if;

  raise notice 'TEST 1 PASSED: guardian sees own linked students with safe initial statuses';
end
$$;
rollback;

-- TEST 2: Guardian sees picked_up after pickup event exists.
begin;
insert into public.student_trip_events (tenant_id, driver_trip_id, student_id, event_type, event_time, created_by)
values ('8a100000-0000-0000-0000-000000000001', '8a200000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000001', 'picked_up', now() - interval '5 minutes', '8a120000-0000-0000-0000-000000000004');
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_status text;
  v_pickup timestamptz;
  v_dropoff timestamptz;
  v_last timestamptz;
begin
  select student_trip_status, pickup_event_time, dropoff_event_time, last_event_time
  into v_status, v_pickup, v_dropoff, v_last
  from public.get_guardian_student_trip_event_visibility()
  where student_id = '8a150000-0000-0000-0000-000000000001';

  if v_status <> 'picked_up' or v_pickup is null or v_dropoff is not null or v_last is null then
    raise exception 'TEST 2 FAILED: expected picked_up with pickup/last times, got %, %, %, %',
      v_status, v_pickup, v_dropoff, v_last;
  end if;

  raise notice 'TEST 2 PASSED: guardian sees picked_up after pickup event';
end
$$;
rollback;

-- TEST 3: Guardian sees dropped_off after drop-off event exists.
begin;
insert into public.student_trip_events (tenant_id, driver_trip_id, student_id, event_type, event_time, created_by)
values
  ('8a100000-0000-0000-0000-000000000001', '8a200000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000001', 'picked_up', now() - interval '5 minutes', '8a120000-0000-0000-0000-000000000004'),
  ('8a100000-0000-0000-0000-000000000001', '8a200000-0000-0000-0000-000000000001', '8a150000-0000-0000-0000-000000000001', 'dropped_off', now() - interval '1 minute', '8a120000-0000-0000-0000-000000000004');
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_status text;
  v_pickup timestamptz;
  v_dropoff timestamptz;
  v_last timestamptz;
begin
  select student_trip_status, pickup_event_time, dropoff_event_time, last_event_time
  into v_status, v_pickup, v_dropoff, v_last
  from public.get_guardian_student_trip_event_visibility()
  where student_id = '8a150000-0000-0000-0000-000000000001';

  if v_status <> 'dropped_off' or v_pickup is null or v_dropoff is null or v_last <> v_dropoff then
    raise exception 'TEST 3 FAILED: expected dropped_off with event times, got %, %, %, %',
      v_status, v_pickup, v_dropoff, v_last;
  end if;

  raise notice 'TEST 3 PASSED: guardian sees dropped_off after drop-off event';
end
$$;
rollback;

-- TEST 4: Guardian cannot see another guardian's linked student.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  if exists (
    select 1
    from public.get_guardian_student_trip_event_visibility()
    where student_id = '8a150000-0000-0000-0000-000000000003'
  ) then
    raise exception 'TEST 4 FAILED: Guardian A saw Guardian B student';
  end if;

  raise notice 'TEST 4 PASSED: another guardian student is hidden';
end
$$;
rollback;

-- TEST 5: Guardian cannot see an unlinked same-tenant student.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  if exists (
    select 1
    from public.get_guardian_student_trip_event_visibility()
    where student_id = '8a150000-0000-0000-0000-000000000004'
  ) then
    raise exception 'TEST 5 FAILED: Guardian A saw unlinked same-tenant student';
  end if;

  raise notice 'TEST 5 PASSED: unlinked same-tenant student is hidden';
end
$$;
rollback;

-- TEST 6: Guardian cannot see a student or event data from another tenant.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  if exists (
    select 1
    from public.get_guardian_student_trip_event_visibility()
    where student_id = '8a150000-0000-0000-0000-000000000005'
       or student_display_name like '%CrossTenant%'
       or route_name like '%CrossTenant%'
       or student_trip_status = 'dropped_off'
  ) then
    raise exception 'TEST 6 FAILED: Guardian A saw cross-tenant student or event data';
  end if;

  raise notice 'TEST 6 PASSED: cross-tenant student and event data are hidden';
end
$$;
rollback;

-- TEST 7: Driver cannot receive guardian event visibility rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 7 FAILED: expected driver, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_student_trip_event_visibility();

  if v_count <> 0 then
    raise exception 'TEST 7 FAILED: driver got % rows from guardian RPC', v_count;
  end if;

  raise notice 'TEST 7 PASSED: driver gets no guardian event visibility rows';
end
$$;
rollback;

-- TEST 8: Tenant admin and transportation admin cannot receive guardian rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 8 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_student_trip_event_visibility();

  if v_count <> 0 then
    raise exception 'TEST 8 FAILED: tenant admin got % rows from guardian RPC', v_count;
  end if;
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000007';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000007","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if public.current_user_role() <> 'transportation_admin' then
    raise exception 'TEST 8 FAILED: expected transportation_admin, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_student_trip_event_visibility();

  if v_count <> 0 then
    raise exception 'TEST 8 FAILED: transportation admin got % rows from guardian RPC', v_count;
  end if;

  raise notice 'TEST 8 PASSED: admins get no guardian event visibility rows';
end
$$;
rollback;

-- TEST 9: Anonymous access is denied or returns zero rows.
begin;
set local role anon;
do $$
declare
  v_count int;
begin
  if auth.uid() is not null then
    raise exception 'TEST 9 FAILED: expected anon auth.uid() null, got %', auth.uid();
  end if;

  begin
    select count(*) into v_count from public.get_guardian_student_trip_event_visibility();
    if v_count <> 0 then
      raise exception 'TEST 9 FAILED: anon got % rows from guardian RPC', v_count;
    end if;
    raise notice 'TEST 9 PASSED: anon got zero rows from guardian RPC';
  exception
    when insufficient_privilege then
      raise notice 'TEST 9 PASSED: anon is blocked from executing guardian RPC';
  end;
end
$$;
rollback;

-- TEST 10: RPC return type does not expose forbidden identifiers or operational fields.
do $$
declare
  v_result text;
  v_forbidden text;
  v_forbidden_fields text[] := array[
    'event_id',
    'driver_trip_id',
    'trip_id',
    'driver_id',
    'bus_id',
    'tenant_id',
    'guardian_id',
    'driver_email',
    'driver_phone',
    'guardian_email',
    'guardian_phone',
    'latitude',
    'longitude',
    'coordinates',
    'speed',
    'eta',
    'qr',
    'created_by',
    'created_at'
  ];
begin
  select lower(pg_get_function_result('public.get_guardian_student_trip_event_visibility()'::regprocedure))
  into v_result;

  foreach v_forbidden in array v_forbidden_fields loop
    if v_result like '%' || v_forbidden || '%' then
      raise exception 'TEST 10 FAILED: forbidden return field exposed: % in %', v_forbidden, v_result;
    end if;
  end loop;

  raise notice 'TEST 10 PASSED: RPC return shape excludes forbidden fields';
end
$$;

-- TEST 11: Direct browser-style SELECT on student_trip_events is blocked.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '8a120000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"8a120000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  begin
    select count(*) into v_count from public.student_trip_events;
    raise exception 'TEST 11 FAILED: direct event table SELECT was allowed and returned % rows', v_count;
  exception
    when insufficient_privilege then
      raise notice 'TEST 11 PASSED: direct event table SELECT is blocked';
  end;
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.student_trip_events where driver_trip_id in (
  '8a200000-0000-0000-0000-000000000001',
  '8a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trips where id in (
  '8a200000-0000-0000-0000-000000000001',
  '8a200000-0000-0000-0000-000000000002'
);

delete from public.student_route_assignments where id in (
  '8a190000-0000-0000-0000-000000000001',
  '8a190000-0000-0000-0000-000000000002',
  '8a190000-0000-0000-0000-000000000003',
  '8a190000-0000-0000-0000-000000000004',
  '8a190000-0000-0000-0000-000000000005'
);

delete from public.route_stops where id in (
  '8a180000-0000-0000-0000-000000000001',
  '8a180000-0000-0000-0000-000000000002',
  '8a180000-0000-0000-0000-000000000003',
  '8a180000-0000-0000-0000-000000000004',
  '8a180000-0000-0000-0000-000000000005',
  '8a180000-0000-0000-0000-000000000006'
);

delete from public.routes where id in (
  '8a170000-0000-0000-0000-000000000001',
  '8a170000-0000-0000-0000-000000000002',
  '8a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '8a160000-0000-0000-0000-000000000001',
  '8a160000-0000-0000-0000-000000000002'
);

delete from public.student_guardians where id in (
  '8a155000-0000-0000-0000-000000000001',
  '8a155000-0000-0000-0000-000000000002',
  '8a155000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '8a150000-0000-0000-0000-000000000001',
  '8a150000-0000-0000-0000-000000000002',
  '8a150000-0000-0000-0000-000000000003',
  '8a150000-0000-0000-0000-000000000004',
  '8a150000-0000-0000-0000-000000000005'
);

delete from public.guardians where id in (
  '8a140000-0000-0000-0000-000000000001',
  '8a140000-0000-0000-0000-000000000002',
  '8a140000-0000-0000-0000-000000000003'
);

delete from public.drivers where id in (
  '8a130000-0000-0000-0000-000000000001',
  '8a130000-0000-0000-0000-000000000002'
);

delete from public.profiles where id in (
  '8a120000-0000-0000-0000-000000000001',
  '8a120000-0000-0000-0000-000000000002',
  '8a120000-0000-0000-0000-000000000003',
  '8a120000-0000-0000-0000-000000000004',
  '8a120000-0000-0000-0000-000000000005',
  '8a120000-0000-0000-0000-000000000006',
  '8a120000-0000-0000-0000-000000000007'
);

delete from auth.users where id in (
  '8a120000-0000-0000-0000-000000000001',
  '8a120000-0000-0000-0000-000000000002',
  '8a120000-0000-0000-0000-000000000003',
  '8a120000-0000-0000-0000-000000000004',
  '8a120000-0000-0000-0000-000000000005',
  '8a120000-0000-0000-0000-000000000006',
  '8a120000-0000-0000-0000-000000000007'
);

delete from public.schools where id in (
  '8a110000-0000-0000-0000-000000000001',
  '8a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '8a100000-0000-0000-0000-000000000001',
  '8a100000-0000-0000-0000-000000000002'
);
