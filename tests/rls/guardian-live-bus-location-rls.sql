-- SafeBus Alberta - RLS Regression Tests: Guardian Live Bus Location State
--
-- Milestone 11A: manual database/RLS regression tests for
-- public.get_guardian_student_live_bus_location_state().
--
-- SELF-CONTAINED. Uses fixed M11A_TEST IDs, cleans up before and after, and
-- simulates browser users with transaction-local JWT settings.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.driver_trip_current_locations where driver_trip_id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.driver_trip_location_updates where driver_trip_id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.driver_trips where id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.student_route_assignments where id in (
  '11a10000-0000-0000-0000-000000000001',
  '11a10000-0000-0000-0000-000000000002',
  '11a10000-0000-0000-0000-000000000003',
  '11a10000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '11a0d000-0000-0000-0000-000000000001',
  '11a0d000-0000-0000-0000-000000000002',
  '11a0d000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '11a0c000-0000-0000-0000-000000000001',
  '11a0c000-0000-0000-0000-000000000002',
  '11a0c000-0000-0000-0000-000000000003'
);

delete from public.student_guardians where id in (
  '11a0b000-0000-0000-0000-000000000001',
  '11a0b000-0000-0000-0000-000000000002',
  '11a0b000-0000-0000-0000-000000000003',
  '11a0b000-0000-0000-0000-000000000004',
  '11a0b000-0000-0000-0000-000000000005'
);

delete from public.students where id in (
  '11a0a000-0000-0000-0000-000000000001',
  '11a0a000-0000-0000-0000-000000000002',
  '11a0a000-0000-0000-0000-000000000003',
  '11a0a000-0000-0000-0000-000000000004',
  '11a0a000-0000-0000-0000-000000000005'
);

delete from public.guardians where id in (
  '11a09000-0000-0000-0000-000000000001',
  '11a09000-0000-0000-0000-000000000002',
  '11a09000-0000-0000-0000-000000000003'
);

delete from public.drivers where id in (
  '11a09000-0000-0000-0000-000000000011',
  '11a09000-0000-0000-0000-000000000012',
  '11a09000-0000-0000-0000-000000000013'
);

delete from public.profiles where id in (
  '11a08000-0000-0000-0000-000000000001',
  '11a08000-0000-0000-0000-000000000002',
  '11a08000-0000-0000-0000-000000000003',
  '11a08000-0000-0000-0000-000000000004',
  '11a08000-0000-0000-0000-000000000005',
  '11a08000-0000-0000-0000-000000000006',
  '11a08000-0000-0000-0000-000000000011',
  '11a08000-0000-0000-0000-000000000012',
  '11a08000-0000-0000-0000-000000000013'
);

delete from auth.users where id in (
  '11a08000-0000-0000-0000-000000000001',
  '11a08000-0000-0000-0000-000000000002',
  '11a08000-0000-0000-0000-000000000003',
  '11a08000-0000-0000-0000-000000000004',
  '11a08000-0000-0000-0000-000000000005',
  '11a08000-0000-0000-0000-000000000006',
  '11a08000-0000-0000-0000-000000000011',
  '11a08000-0000-0000-0000-000000000012',
  '11a08000-0000-0000-0000-000000000013'
);

delete from public.schools where id in (
  '11a07000-0000-0000-0000-000000000001',
  '11a07000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '11a06000-0000-0000-0000-000000000001',
  '11a06000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('11a06000-0000-0000-0000-000000000001', 'M11A_TEST_Tenant_A', 'school', 'active'),
  ('11a06000-0000-0000-0000-000000000002', 'M11A_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('11a07000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', 'M11A_TEST_School_A', 'AB', 'active'),
  ('11a07000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000002', 'M11A_TEST_School_B', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11a08000-0000-0000-0000-000000000001', 'm11a_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000002', 'm11a_guardian_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000003', 'm11a_driver@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000004', 'm11a_guardian_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000005', 'm11a_guardian_no_identity@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000006', 'm11a_guardian_b_tenant@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000011', 'm11a_driver_a2@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000012', 'm11a_driver_a3@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11a08000-0000-0000-0000-000000000013', 'm11a_driver_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('11a08000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A Admin', 'm11a_admin@test.local', 'tenant_admin', 'active'),
  ('11a08000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', null, 'M11A Guardian A', 'm11a_guardian_a@test.local', 'guardian', 'active'),
  ('11a08000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000001', null, 'M11A Driver', 'm11a_driver@test.local', 'driver', 'active'),
  ('11a08000-0000-0000-0000-000000000004', '11a06000-0000-0000-0000-000000000001', null, 'M11A Guardian B', 'm11a_guardian_b@test.local', 'guardian', 'active'),
  ('11a08000-0000-0000-0000-000000000005', '11a06000-0000-0000-0000-000000000001', null, 'M11A Guardian No Identity', 'm11a_guardian_no_identity@test.local', 'guardian', 'active'),
  ('11a08000-0000-0000-0000-000000000006', '11a06000-0000-0000-0000-000000000002', null, 'M11A Guardian Tenant B', 'm11a_guardian_b_tenant@test.local', 'guardian', 'active'),
  ('11a08000-0000-0000-0000-000000000011', '11a06000-0000-0000-0000-000000000001', null, 'M11A Driver A2', 'm11a_driver_a2@test.local', 'driver', 'active'),
  ('11a08000-0000-0000-0000-000000000012', '11a06000-0000-0000-0000-000000000001', null, 'M11A Driver A3', 'm11a_driver_a3@test.local', 'driver', 'active'),
  ('11a08000-0000-0000-0000-000000000013', '11a06000-0000-0000-0000-000000000002', null, 'M11A Driver B', 'm11a_driver_b@test.local', 'driver', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('11a09000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a08000-0000-0000-0000-000000000002', 'M11A Guardian A', 'm11a_guardian_a@test.local', 'active'),
  ('11a09000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a08000-0000-0000-0000-000000000004', 'M11A Guardian B', 'm11a_guardian_b@test.local', 'active'),
  ('11a09000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000002', '11a08000-0000-0000-0000-000000000006', 'M11A Guardian Tenant B', 'm11a_guardian_b_tenant@test.local', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('11a09000-0000-0000-0000-000000000011', '11a06000-0000-0000-0000-000000000001', '11a08000-0000-0000-0000-000000000003', 'active'),
  ('11a09000-0000-0000-0000-000000000012', '11a06000-0000-0000-0000-000000000001', '11a08000-0000-0000-0000-000000000011', 'active'),
  ('11a09000-0000-0000-0000-000000000013', '11a06000-0000-0000-0000-000000000002', '11a08000-0000-0000-0000-000000000013', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('11a0c000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', 'M11A-BUS-1', 'active'),
  ('11a0c000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', 'M11A-BUS-2', 'active'),
  ('11a0c000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000002', 'M11A-BUS-3', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('11a0d000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A Route A1', 'M11A-A1', 'morning', 'active'),
  ('11a0d000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A Route A2', 'M11A-A2', 'morning', 'active'),
  ('11a0d000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000002', '11a07000-0000-0000-0000-000000000002', 'M11A Route B1', 'M11A-B1', 'morning', 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('11a0a000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A', 'Student_A', 'active'),
  ('11a0a000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A', 'Student_Sibling', 'active'),
  ('11a0a000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A', 'Student_Guardian_B', 'active'),
  ('11a0a000-0000-0000-0000-000000000004', '11a06000-0000-0000-0000-000000000002', '11a07000-0000-0000-0000-000000000002', 'M11A', 'Student_Tenant_B', 'active'),
  ('11a0a000-0000-0000-0000-000000000005', '11a06000-0000-0000-0000-000000000001', '11a07000-0000-0000-0000-000000000001', 'M11A', 'Student_Inactive_Link', 'active');

insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values
  ('11a0b000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('11a0b000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000002', '11a09000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('11a0b000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000003', '11a09000-0000-0000-0000-000000000002', 'guardian', 'active'),
  ('11a0b000-0000-0000-0000-000000000004', '11a06000-0000-0000-0000-000000000002', '11a0a000-0000-0000-0000-000000000004', '11a09000-0000-0000-0000-000000000003', 'guardian', 'active'),
  ('11a0b000-0000-0000-0000-000000000005', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000005', '11a09000-0000-0000-0000-000000000001', 'guardian', 'inactive');

insert into public.student_route_assignments (id, tenant_id, student_id, route_id, status)
values
  ('11a10000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000001', '11a0d000-0000-0000-0000-000000000001', 'active'),
  ('11a10000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000002', '11a0d000-0000-0000-0000-000000000001', 'active'),
  ('11a10000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000003', '11a0d000-0000-0000-0000-000000000002', 'active'),
  ('11a10000-0000-0000-0000-000000000004', '11a06000-0000-0000-0000-000000000002', '11a0a000-0000-0000-0000-000000000004', '11a0d000-0000-0000-0000-000000000003', 'active');

insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('11a20000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000011', '11a0c000-0000-0000-0000-000000000001', '11a0d000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '10 minutes'),
  ('11a20000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000012', '11a0c000-0000-0000-0000-000000000002', '11a0d000-0000-0000-0000-000000000002', 'morning', 'active', current_date, now() - interval '8 minutes'),
  ('11a20000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000002', '11a09000-0000-0000-0000-000000000013', '11a0c000-0000-0000-0000-000000000003', '11a0d000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '7 minutes');

insert into public.driver_trip_current_locations (driver_trip_id, tenant_id, driver_id, bus_id, route_id, latitude, longitude, recorded_at)
values
  ('11a20000-0000-0000-0000-000000000001', '11a06000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000011', '11a0c000-0000-0000-0000-000000000001', '11a0d000-0000-0000-0000-000000000001', 51.0447, -114.0719, now() - interval '30 seconds'),
  ('11a20000-0000-0000-0000-000000000002', '11a06000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000012', '11a0c000-0000-0000-0000-000000000002', '11a0d000-0000-0000-0000-000000000002', 52.0000, -115.0000, now() - interval '30 seconds'),
  ('11a20000-0000-0000-0000-000000000003', '11a06000-0000-0000-0000-000000000002', '11a09000-0000-0000-0000-000000000013', '11a0c000-0000-0000-0000-000000000003', '11a0d000-0000-0000-0000-000000000003', 53.0000, -116.0000, now() - interval '30 seconds');

-- ===========================================================================
-- AUTHENTICATION AND ROLE DENIAL
-- ===========================================================================

begin;
set local role anon;
do $$
begin
  begin
    perform * from public.get_guardian_student_live_bus_location_state();
    raise exception 'TEST 1 FAILED: anonymous caller was not denied';
  exception
    when insufficient_privilege then
      raise notice 'TEST 1 PASSED: anonymous caller denied';
  end;
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.get_guardian_student_live_bus_location_state();
    raise exception 'TEST 2 FAILED: tenant admin was not denied';
  exception
    when insufficient_privilege then
      raise notice 'TEST 2 PASSED: tenant admin denied';
  end;
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.get_guardian_student_live_bus_location_state();
    raise exception 'TEST 3 FAILED: driver was not denied';
  exception
    when insufficient_privilege then
      raise notice 'TEST 3 PASSED: driver denied';
  end;
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000005';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.get_guardian_student_live_bus_location_state();
    raise exception 'TEST 4 FAILED: guardian without identity was not denied';
  exception
    when insufficient_privilege then
      raise notice 'TEST 4 PASSED: guardian role without active guardian identity denied';
  end;
end
$$;
rollback;

-- ===========================================================================
-- POSITIVE VISIBILITY, ISOLATION, AND CONTRACT
-- ===========================================================================

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
  v_row record;
  v_forbidden text[];
begin
  select coalesce(array_agg(student_id order by student_id), array[]::uuid[]) into v_ids
  from public.get_guardian_student_live_bus_location_state();

  if v_ids <> array[
    '11a0a000-0000-0000-0000-000000000001'::uuid,
    '11a0a000-0000-0000-0000-000000000002'::uuid
  ] then
    raise exception 'TEST 5/6/7/8/9 FAILED: Guardian A saw unexpected students: %', v_ids;
  end if;

  select * into v_row
  from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';

  if v_row.location_state <> 'fresh' or v_row.latitude <> 51.0447 or v_row.longitude <> -114.0719 then
    raise exception 'TEST 5 FAILED: expected fresh coordinates, got %, %, %', v_row.location_state, v_row.latitude, v_row.longitude;
  end if;
  if v_row.location_recorded_at is null or v_row.location_age_seconds < 0 then
    raise exception 'TEST 5 FAILED: expected nonnegative server age and timestamp';
  end if;

  select array_agg(parameter_name::text order by parameter_name::text) into v_forbidden
  from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'get_guardian_student_live_bus_location_state_%'
    and parameter_mode = 'OUT'
    and parameter_name = any(array[
      'speed_mps', 'driver_id', 'guardian_id', 'route_id', 'trip_id', 'bus_id',
      'pickup_stop_name', 'dropoff_stop_name', 'home_address', 'route_geometry'
    ]);

  if v_forbidden is not null then
    raise exception 'TEST 30 FAILED: forbidden output columns exist: %', v_forbidden;
  end if;

  raise notice 'TEST 5/6/7/8/9/30 PASSED: fresh location, two linked siblings, same-bus student correlation, same-tenant isolation, cross-tenant isolation, safe contract';
end
$$;
rollback;

begin;
insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values ('11a0b000-0000-0000-0000-000000000099', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000004', '11a09000-0000-0000-0000-000000000001', 'guardian', 'active');
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000004';
  if v_count <> 0 then
    raise exception 'TEST 10 FAILED: malformed cross-tenant link broadened access';
  end if;
  raise notice 'TEST 10 PASSED: malformed cross-tenant link fails closed';
end
$$;
rollback;

-- ===========================================================================
-- ACTIVITY-STATE ENFORCEMENT
-- ===========================================================================

begin;
update public.student_guardians set status = 'inactive' where id = '11a0b000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_count <> 0 then raise exception 'TEST 11 FAILED: inactive link visible'; end if;
  raise notice 'TEST 11 PASSED: inactive guardian-student link hidden';
end
$$;
rollback;

begin;
update public.students set status = 'inactive' where id = '11a0a000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_count <> 0 then raise exception 'TEST 12 FAILED: inactive student visible'; end if;
  raise notice 'TEST 12 PASSED: inactive student hidden';
end
$$;
rollback;

begin;
update public.guardians set status = 'inactive' where id = '11a09000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.get_guardian_student_live_bus_location_state();
    raise exception 'TEST 13 FAILED: inactive guardian was not denied';
  exception
    when insufficient_privilege then
      raise notice 'TEST 13 PASSED: inactive guardian identity denied';
  end;
end
$$;
rollback;

begin;
update public.student_route_assignments set status = 'inactive' where id = '11a10000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_count <> 0 then raise exception 'TEST 14 FAILED: inactive assignment visible'; end if;
  raise notice 'TEST 14 PASSED: inactive assignment hidden';
end
$$;
rollback;

begin;
update public.student_route_assignments set route_id = '11a0d000-0000-0000-0000-000000000002' where id = '11a10000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_state text;
begin
  select location_state into v_state from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_state <> 'fresh' then raise exception 'TEST 15 FAILED: reassigned route did not use matching route trip safely, got %', v_state; end if;
  raise notice 'TEST 15 PASSED: assignment route controls which active trip can match';
end
$$;
rollback;

begin;
update public.driver_trips set status = 'completed', ended_at = now() where id = '11a20000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_live_bus_location_state()
  where student_id in ('11a0a000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000002');
  if v_count <> 0 then raise exception 'TEST 16 FAILED: completed trip visible'; end if;
  raise notice 'TEST 16 PASSED: non-active trip hidden';
end
$$;
rollback;

-- ===========================================================================
-- LOCATION-STATE BEHAVIOR
-- ===========================================================================

begin;
update public.driver_trip_current_locations
set recorded_at = now() - interval '3 minutes'
where driver_trip_id = '11a20000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_row record;
begin
  select * into v_row from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_row.location_state <> 'stale' or v_row.latitude is not null or v_row.longitude is not null or v_row.location_age_seconds < 120 then
    raise exception 'TEST 18 FAILED: expected stale without coordinates, got %, %, %, %', v_row.location_state, v_row.latitude, v_row.longitude, v_row.location_age_seconds;
  end if;
  raise notice 'TEST 18 PASSED: stale coordinates withheld';
end
$$;
rollback;

begin;
delete from public.driver_trip_current_locations where driver_trip_id = '11a20000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_row record;
begin
  select * into v_row from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_row.location_state <> 'missing' or v_row.latitude is not null or v_row.longitude is not null or v_row.location_recorded_at is not null or v_row.location_age_seconds is not null then
    raise exception 'TEST 19 FAILED: expected missing without location fields';
  end if;
  raise notice 'TEST 19 PASSED: missing location controlled';
end
$$;
rollback;

begin;
update public.driver_trip_current_locations
set recorded_at = now() + interval '5 minutes'
where driver_trip_id = '11a20000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_row record;
begin
  select * into v_row from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_row.location_state <> 'invalid' or v_row.latitude is not null or v_row.longitude is not null or v_row.location_age_seconds is not null then
    raise exception 'TEST 23 FAILED: expected future timestamp invalid without negative age';
  end if;
  raise notice 'TEST 23 PASSED: unsafe future timestamp is invalid';
end
$$;
rollback;

do $$
declare
  v_lat_check boolean;
  v_lng_check boolean;
  v_not_null boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.driver_trip_current_locations'::regclass
      and conname = 'driver_trip_current_locations_latitude_check'
  ) into v_lat_check;
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.driver_trip_current_locations'::regclass
      and conname = 'driver_trip_current_locations_longitude_check'
  ) into v_lng_check;
  select bool_and(attnotnull) into v_not_null
  from pg_attribute
  where attrelid = 'public.driver_trip_current_locations'::regclass
    and attname in ('latitude', 'longitude', 'recorded_at');

  if not (v_lat_check and v_lng_check and v_not_null) then
    raise exception 'TEST 20/21/22 FAILED: expected invalid coordinate/null protections on current-location table';
  end if;
  raise notice 'TEST 20/21/22 PASSED: invalid latitude/longitude/null coordinates are schema-blocked; RPC still classifies unsafe reachable rows as invalid';
end
$$;

-- ===========================================================================
-- DUPLICATE PREVENTION, AMBIGUITY, DIRECT ACCESS, AND SIGNATURE
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_guardians'::regclass
      and conname = 'student_guardians_student_guardian_unique'
  ) then
    raise exception 'TEST 24 FAILED: missing student_guardians duplicate-prevention constraint';
  end if;
  raise notice 'TEST 24 PASSED: duplicate guardian-student relationship constrained';
end
$$;

begin;
insert into public.student_route_assignments (id, tenant_id, student_id, route_id, status)
values ('11a10000-0000-0000-0000-000000000099', '11a06000-0000-0000-0000-000000000001', '11a0a000-0000-0000-0000-000000000001', '11a0d000-0000-0000-0000-000000000001', 'active');
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_count <> 1 then raise exception 'TEST 25 FAILED: duplicate assignment produced % rows', v_count; end if;
  raise notice 'TEST 25 PASSED: duplicate-producing joins return one row per student';
end
$$;
rollback;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.driver_trip_current_locations'::regclass
      and contype = 'p'
  ) then
    raise exception 'TEST 26 FAILED: current-location table is not one row per trip';
  end if;
  raise notice 'TEST 26 PASSED: current-location storage enforces one row per trip';
end
$$;

begin;
update public.driver_trips
set status = 'completed', ended_at = now()
where id = '11a20000-0000-0000-0000-000000000002';
insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values ('11a20000-0000-0000-0000-000000000004', '11a06000-0000-0000-0000-000000000001', '11a09000-0000-0000-0000-000000000012', '11a0c000-0000-0000-0000-000000000002', '11a0d000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '1 minute');
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_row record;
begin
  select * into v_row from public.get_guardian_student_live_bus_location_state()
  where student_id = '11a0a000-0000-0000-0000-000000000001';
  if v_row.location_state <> 'invalid' or v_row.latitude is not null or v_row.longitude is not null then
    raise exception 'TEST 27 FAILED: ambiguous active trips did not fail closed';
  end if;
  raise notice 'TEST 27 PASSED: ambiguous multiple active trips return one invalid row';
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11a08000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11a08000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_direct_count int;
  v_rpc_count int;
begin
  select count(*) into v_direct_count from public.driver_trip_current_locations;
  if v_direct_count <> 0 then
    raise exception 'TEST 28 FAILED: guardian can directly read current-location rows';
  end if;

  select count(*) into v_rpc_count from public.get_guardian_student_live_bus_location_state();
  if v_rpc_count <> 2 then
    raise exception 'TEST 28 FAILED: expected safe RPC rows after direct read denial, got %', v_rpc_count;
  end if;
  raise notice 'TEST 28 PASSED: direct location-table read denied while safe RPC works';
end
$$;
rollback;

do $$
declare
  v_in_args int;
  v_out_columns text[];
begin
  select count(*) into v_in_args
  from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'get_guardian_student_live_bus_location_state_%'
    and parameter_mode in ('IN', 'INOUT');
  if v_in_args <> 0 then
    raise exception 'TEST 29 FAILED: RPC has % caller-controlled input args', v_in_args;
  end if;

  select array_agg(parameter_name::text order by ordinal_position) into v_out_columns
  from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'get_guardian_student_live_bus_location_state_%'
    and parameter_mode = 'OUT';
  if v_out_columns <> array[
    'student_id',
    'location_state',
    'latitude',
    'longitude',
    'location_recorded_at',
    'location_age_seconds'
  ] then
    raise exception 'TEST 29/30 FAILED: unexpected RPC result contract: %', v_out_columns;
  end if;
  raise notice 'TEST 29/30 PASSED: no scope-widening args and forbidden columns excluded';
end
$$;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.driver_trip_current_locations where driver_trip_id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.driver_trip_location_updates where driver_trip_id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.driver_trips where id in (
  '11a20000-0000-0000-0000-000000000001',
  '11a20000-0000-0000-0000-000000000002',
  '11a20000-0000-0000-0000-000000000003',
  '11a20000-0000-0000-0000-000000000004'
);

delete from public.student_route_assignments where id in (
  '11a10000-0000-0000-0000-000000000001',
  '11a10000-0000-0000-0000-000000000002',
  '11a10000-0000-0000-0000-000000000003',
  '11a10000-0000-0000-0000-000000000004',
  '11a10000-0000-0000-0000-000000000099'
);

delete from public.routes where id in (
  '11a0d000-0000-0000-0000-000000000001',
  '11a0d000-0000-0000-0000-000000000002',
  '11a0d000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '11a0c000-0000-0000-0000-000000000001',
  '11a0c000-0000-0000-0000-000000000002',
  '11a0c000-0000-0000-0000-000000000003'
);

delete from public.student_guardians where id in (
  '11a0b000-0000-0000-0000-000000000001',
  '11a0b000-0000-0000-0000-000000000002',
  '11a0b000-0000-0000-0000-000000000003',
  '11a0b000-0000-0000-0000-000000000004',
  '11a0b000-0000-0000-0000-000000000005',
  '11a0b000-0000-0000-0000-000000000099'
);

delete from public.students where id in (
  '11a0a000-0000-0000-0000-000000000001',
  '11a0a000-0000-0000-0000-000000000002',
  '11a0a000-0000-0000-0000-000000000003',
  '11a0a000-0000-0000-0000-000000000004',
  '11a0a000-0000-0000-0000-000000000005'
);

delete from public.guardians where id in (
  '11a09000-0000-0000-0000-000000000001',
  '11a09000-0000-0000-0000-000000000002',
  '11a09000-0000-0000-0000-000000000003'
);

delete from public.drivers where id in (
  '11a09000-0000-0000-0000-000000000011',
  '11a09000-0000-0000-0000-000000000012',
  '11a09000-0000-0000-0000-000000000013'
);

delete from public.profiles where id in (
  '11a08000-0000-0000-0000-000000000001',
  '11a08000-0000-0000-0000-000000000002',
  '11a08000-0000-0000-0000-000000000003',
  '11a08000-0000-0000-0000-000000000004',
  '11a08000-0000-0000-0000-000000000005',
  '11a08000-0000-0000-0000-000000000006',
  '11a08000-0000-0000-0000-000000000011',
  '11a08000-0000-0000-0000-000000000012',
  '11a08000-0000-0000-0000-000000000013'
);

delete from auth.users where id in (
  '11a08000-0000-0000-0000-000000000001',
  '11a08000-0000-0000-0000-000000000002',
  '11a08000-0000-0000-0000-000000000003',
  '11a08000-0000-0000-0000-000000000004',
  '11a08000-0000-0000-0000-000000000005',
  '11a08000-0000-0000-0000-000000000006',
  '11a08000-0000-0000-0000-000000000011',
  '11a08000-0000-0000-0000-000000000012',
  '11a08000-0000-0000-0000-000000000013'
);

delete from public.schools where id in (
  '11a07000-0000-0000-0000-000000000001',
  '11a07000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '11a06000-0000-0000-0000-000000000001',
  '11a06000-0000-0000-0000-000000000002'
);
