-- SafeBus Alberta - RLS Regression Tests: Guardian Live Trip Visibility
--
-- Milestone 6A: manual database/RLS regression tests for
-- public.get_guardian_live_trip_visibility() — the guardian-scoped live bus
-- status read path.
--
-- HOW TO RUN:
--   1. Open the hosted Supabase DEV project SQL Editor (never production).
--   2. Run this whole file, or run the sections in order:
--      - privileged cleanup-before-seed
--      - privileged seed (self-contained)
--      - individual test transactions
--      - privileged cleanup-after-tests
--   3. This file is SELF-CONTAINED. It does NOT depend on the seed in
--      student-roster-rls.sql, and its fixed IDs do not collide with it.
--
-- Each simulated user assertion runs inside its own explicit transaction with
-- transaction-local role/JWT settings and rollback. The tests set both
-- request.jwt.claim.sub/request.jwt.claim.role and legacy JSON
-- request.jwt.claims, then assert auth.uid() BEFORE the RPC/RLS assertion so a
-- broken simulation fails fast.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED (only this file's fixed IDs)
-- ===========================================================================

delete from public.driver_trip_current_locations where driver_trip_id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trip_location_updates where driver_trip_id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trips where id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002',
  '1a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '0f100000-0000-0000-0000-000000000001',
  '0f100000-0000-0000-0000-000000000002',
  '0f100000-0000-0000-0000-000000000003',
  '0f100000-0000-0000-0000-000000000004'
);

delete from public.route_stops where id in (
  '0e000000-0000-0000-0000-000000000001',
  '0e000000-0000-0000-0000-000000000002',
  '0e000000-0000-0000-0000-000000000003',
  '0e000000-0000-0000-0000-000000000004',
  '0e000000-0000-0000-0000-000000000005',
  '0e000000-0000-0000-0000-000000000006'
);

delete from public.routes where id in (
  '0d000000-0000-0000-0000-000000000001',
  '0d000000-0000-0000-0000-000000000002',
  '0d000000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '0c000000-0000-0000-0000-000000000001',
  '0c000000-0000-0000-0000-000000000002'
);

delete from public.student_guardians where id in (
  '0b000000-0000-0000-0000-000000000001',
  '0b000000-0000-0000-0000-000000000002',
  '0b000000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '0a000000-0000-0000-0000-000000000001',
  '0a000000-0000-0000-0000-000000000002',
  '0a000000-0000-0000-0000-000000000003',
  '0a000000-0000-0000-0000-000000000004'
);

delete from public.guardians where id in (
  '09000000-0000-0000-0000-000000000001',
  '09000000-0000-0000-0000-000000000002'
);

delete from public.drivers where id in (
  '09000000-0000-0000-0000-000000000003',
  '09000000-0000-0000-0000-000000000004'
);

delete from public.profiles where id in (
  '08000000-0000-0000-0000-000000000001',
  '08000000-0000-0000-0000-000000000002',
  '08000000-0000-0000-0000-000000000003',
  '08000000-0000-0000-0000-000000000004',
  '08000000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '08000000-0000-0000-0000-000000000001',
  '08000000-0000-0000-0000-000000000002',
  '08000000-0000-0000-0000-000000000003',
  '08000000-0000-0000-0000-000000000004',
  '08000000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '07000000-0000-0000-0000-000000000001',
  '07000000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '06000000-0000-0000-0000-000000000001',
  '06000000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('06000000-0000-0000-0000-000000000001', 'M6A_TEST_Tenant_A', 'school', 'active'),
  ('06000000-0000-0000-0000-000000000002', 'M6A_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('07000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'M6A_TEST_School_A1', 'AB', 'active'),
  ('07000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000002', 'M6A_TEST_School_B1', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('08000000-0000-0000-0000-000000000001', 'm6a_tenant_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('08000000-0000-0000-0000-000000000002', 'm6a_guardian_a@test.local',   crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('08000000-0000-0000-0000-000000000003', 'm6a_driver@test.local',       crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('08000000-0000-0000-0000-000000000004', 'm6a_guardian_b@test.local',   crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('08000000-0000-0000-0000-000000000005', 'm6a_driver_b@test.local',     crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('08000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A Tenant Admin', 'm6a_tenant_admin@test.local', 'tenant_admin', 'active'),
  ('08000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', null, 'M6A Guardian A', 'm6a_guardian_a@test.local', 'guardian', 'active'),
  ('08000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000001', null, 'M6A Driver', 'm6a_driver@test.local', 'driver', 'active'),
  ('08000000-0000-0000-0000-000000000004', '06000000-0000-0000-0000-000000000001', null, 'M6A Guardian B', 'm6a_guardian_b@test.local', 'guardian', 'active'),
  ('08000000-0000-0000-0000-000000000005', '06000000-0000-0000-0000-000000000002', null, 'M6A Driver B', 'm6a_driver_b@test.local', 'driver', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('09000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '08000000-0000-0000-0000-000000000002', 'M6A Guardian A', 'm6a_guardian_a@test.local', 'active'),
  ('09000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '08000000-0000-0000-0000-000000000004', 'M6A Guardian B', 'm6a_guardian_b@test.local', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('09000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000001', '08000000-0000-0000-0000-000000000003', 'active'),
  ('09000000-0000-0000-0000-000000000004', '06000000-0000-0000-0000-000000000002', '08000000-0000-0000-0000-000000000005', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('0c000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'M6A-BUS-1', 'active'),
  ('0c000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000002', 'M6A-BUS-2', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('0d000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A Route A1', 'M6A-A1', 'morning', 'active'),
  ('0d000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A Route A2', 'M6A-A2', 'afternoon', 'active'),
  ('0d000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000002', '07000000-0000-0000-0000-000000000002', 'M6A Route B1', 'M6A-B1', 'morning', 'active');

insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, status)
values
  ('0e000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'M6A Stop Pick A1', 1, 'active'),
  ('0e000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'M6A Stop Drop A1', 2, 'active'),
  ('0e000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 'M6A Stop Pick A2', 1, 'active'),
  ('0e000000-0000-0000-0000-000000000004', '06000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 'M6A Stop Drop A2', 2, 'active'),
  -- Tenant B stops used by hardening tests to prove malformed cross-tenant
  -- stop references are not exposed through the SECURITY DEFINER RPC.
  ('0e000000-0000-0000-0000-000000000005', '06000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000003', 'M6A Stop Pick B1 SHOULD NOT LEAK', 1, 'active'),
  ('0e000000-0000-0000-0000-000000000006', '06000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000003', 'M6A Stop Drop B1 SHOULD NOT LEAK', 2, 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('0a000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A', 'Student_A_Linked', 'active'),
  ('0a000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A', 'Student_B_GuardianB', 'active'),
  ('0a000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', 'M6A', 'Student_C_InactiveLink', 'active'),
  ('0a000000-0000-0000-0000-000000000004', '06000000-0000-0000-0000-000000000002', '07000000-0000-0000-0000-000000000002', 'M6A', 'Student_D_CrossTenant', 'active');

-- Guardian A actively linked to Student A (Route A1, has ACTIVE trip + location).
-- Guardian A linked to Student C via an INACTIVE link (must NOT surface).
-- Guardian B (different guardian) actively linked to Student B (Route A2, no trip).
insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values
  ('0b000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('0b000000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000003', '09000000-0000-0000-0000-000000000001', 'guardian', 'inactive'),
  ('0b000000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000002', 'guardian', 'active');

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.student_guardians
  where id = '0b000000-0000-0000-0000-000000000002'
    and guardian_id = '09000000-0000-0000-0000-000000000001'
    and student_id = '0a000000-0000-0000-0000-000000000003'
    and tenant_id = '06000000-0000-0000-0000-000000000001'
    and status = 'inactive';

  if v_count <> 1 then
    raise exception 'SEED FAILED: expected 1 inactive Guardian A -> Student C link row, got %', v_count;
  end if;
end
$$;

-- Route assignments.
insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, status)
values
  -- Student A -> Route A1 (active trip exists below).
  ('0f100000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000002', 'active'),
  -- Student B (Guardian B) -> Route A2 (NO active trip — has_active_trip=false).
  ('0f100000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000003', '0e000000-0000-0000-0000-000000000004', 'active'),
  -- Student C (Guardian A inactive link) -> Route A2. If the inactive link
  -- were incorrectly treated as visible, this active assignment would make the
  -- student eligible to appear in the live-trip RPC result.
  ('0f100000-0000-0000-0000-000000000004', '06000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000003', '0e000000-0000-0000-0000-000000000004', 'active'),
  -- Student D (cross-tenant) -> Route B1 in Tenant B.
  ('0f100000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000004', '0d000000-0000-0000-0000-000000000003', null, null, 'active');

-- Trips.
-- Trip 1: ACTIVE trip on Route A1 (Tenant A), driven by Tenant A driver. Has a current location.
insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('1a200000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '20 minutes');

-- Trip 2: COMPLETED trip on Route A2 (Tenant A). Must NOT surface as active.
insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at, ended_at)
values
  ('1a200000-0000-0000-0000-000000000002', '06000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 'evening', 'completed', current_date, now() - interval '2 hours', now() - interval '1 hour');

-- Trip 3: ACTIVE trip on Route B1 (Tenant B) — cross-tenant, must NOT surface for Tenant A guardian.
insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('1a200000-0000-0000-0000-000000000003', '06000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '15 minutes');

-- Current location for the ACTIVE Tenant A trip (Trip 1).
insert into public.driver_trip_current_locations (driver_trip_id, tenant_id, driver_id, bus_id, route_id, latitude, longitude, recorded_at)
values
  ('1a200000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 51.0447, -114.0719, now() - interval '2 minutes');

-- ===========================================================================
-- TEST 1: Guardian A sees live trip visibility only for actively linked Student A,
--         and that row has has_active_trip=true with the current location.
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 1 FAILED: expected guardian, got %', public.current_user_role();
  end if;
  if public.current_tenant_id() is null then
    raise exception 'TEST 1 FAILED: current_tenant_id() is null';
  end if;
  if public.current_guardian_id() is null then
    raise exception 'TEST 1 FAILED: current_guardian_id() is null';
  end if;

  select
    count(*) as cnt,
    coalesce(array_agg(student_id order by student_id), array[]::uuid[]) as ids,
    bool_or(has_active_trip) as any_active,
    bool_or(last_location_recorded_at is not null) as any_loc
  into v_rows
  from public.get_guardian_live_trip_visibility();

  if v_rows.ids <> array['0a000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'TEST 1 FAILED: expected only Student A, got %', v_rows.ids;
  end if;
  if coalesce(v_rows.any_active, false) <> true then
    raise exception 'TEST 1 FAILED: expected has_active_trip=true for Student A';
  end if;
  if coalesce(v_rows.any_loc, false) <> true then
    raise exception 'TEST 1 FAILED: expected a current location for Student A';
  end if;

  raise notice 'TEST 1 PASSED: Guardian A sees only actively linked Student A with active trip + location';
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Guardian A cannot see unlinked Student (Student C has only INACTIVE link).
--         (Student C is linked to Guardian A via inactive link — must not surface.)
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 2 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 2 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id), array[]::uuid[]) into v_ids
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000003';

  if v_ids <> array[]::uuid[] then
    raise exception 'TEST 2 FAILED: Guardian A saw inactive-link student: %', v_ids;
  end if;

  raise notice 'TEST 2 PASSED: Guardian A cannot see inactive-link student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 3: Guardian A cannot see a student linked to another guardian (Student B / Guardian B).
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 3 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 3 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id), array[]::uuid[]) into v_ids
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000002';

  if v_ids <> array[]::uuid[] then
    raise exception 'TEST 3 FAILED: Guardian A saw Guardian B student: %', v_ids;
  end if;

  raise notice 'TEST 3 PASSED: Guardian A cannot see Guardian B student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 4: Guardian A cannot see inactive guardian-student link (covered in TEST 2;
--         re-asserted here at the link-status level by confirming Student C never appears).
-- ===========================================================================
begin;
-- Privileged sanity check before simulating Guardian A. Guardian SELECT RLS may
-- intentionally hide inactive student_guardians rows, but the fixed seed must
-- contain one inactive link so this test remains meaningful.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.student_guardians
  where id = '0b000000-0000-0000-0000-000000000002'
    and student_id = '0a000000-0000-0000-0000-000000000003'
    and guardian_id = '09000000-0000-0000-0000-000000000001'
    and tenant_id = '06000000-0000-0000-0000-000000000001'
    and status = 'inactive';

  if v_count <> 1 then
    raise exception 'TEST 4 FAILED: expected 1 seeded inactive link row, got %', v_count;
  end if;
end
$$;

set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 4 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 4 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select count(*) into v_count
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000003';

  if v_count <> 0 then
    raise exception 'TEST 4 FAILED: inactive-link student surfaced % times', v_count;
  end if;

  raise notice 'TEST 4 PASSED: inactive link is not surfaced';
end
$$;
rollback;

-- ===========================================================================
-- TEST 5: Guardian A cannot see students from another tenant (Student D is in Tenant B).
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 5 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 5 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id), array[]::uuid[]) into v_ids
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000004';

  if v_ids <> array[]::uuid[] then
    raise exception 'TEST 5 FAILED: Guardian A saw cross-tenant student: %', v_ids;
  end if;

  raise notice 'TEST 5 PASSED: Guardian A cannot see cross-tenant student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 6: Guardian A cannot see trips from another tenant (Trip 3 is Tenant B,
--         on Route B1, which is not visible to Guardian A anyway).
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_route_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 6 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 6 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  -- Guardian A's only route is Route A1. Route B1 (Tenant B) must never appear.
  select coalesce(array_agg(route_id), array[]::uuid[]) into v_route_ids
  from public.get_guardian_live_trip_visibility()
  where route_id = '0d000000-0000-0000-0000-000000000003';

  if v_route_ids <> array[]::uuid[] then
    raise exception 'TEST 6 FAILED: Guardian A saw cross-tenant route/trip: %', v_route_ids;
  end if;

  raise notice 'TEST 6 PASSED: Guardian A cannot see cross-tenant trips';
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Guardian B sees Student B (Route A2) but the COMPLETED trip on Route A2
--         is NOT shown as active (has_active_trip must be false).
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 7 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 7 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select
    student_id,
    has_active_trip,
    last_location_recorded_at
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000002'
  limit 1;

  if not found then
    raise exception 'TEST 7 FAILED: Guardian B did not see Student B';
  end if;
  if v_rows.has_active_trip is not false then
    raise exception 'TEST 7 FAILED: completed trip shown as active (has_active_trip=%)', v_rows.has_active_trip;
  end if;
  if v_rows.last_location_recorded_at is not null then
    raise exception 'TEST 7 FAILED: location present for a non-active trip';
  end if;

  raise notice 'TEST 7 PASSED: completed trip is not shown as active';
end
$$;
rollback;

-- ===========================================================================
-- TEST 8: Guardian A cannot see historical location trail. The RPC must return
--         at most ONE location row per active trip (the current location only).
--         This is structural: the RPC joins driver_trip_current_locations (one
--         row per trip) and never reads driver_trip_location_updates.
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  -- Insert several historical location-update rows directly (privileged) for
  -- the active trip, then confirm the RPC still returns exactly one location
  -- row for Student A (the current location), not the history.
  insert into public.driver_trip_location_updates
    (tenant_id, driver_trip_id, driver_id, bus_id, route_id, latitude, longitude, recorded_at)
  values
    ('06000000-0000-0000-0000-000000000001', '1a200000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 51.0400, -114.0700, now() - interval '10 minutes'),
    ('06000000-0000-0000-0000-000000000001', '1a200000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 51.0410, -114.0705, now() - interval '7 minutes'),
    ('06000000-0000-0000-0000-000000000001', '1a200000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 51.0420, -114.0710, now() - interval '5 minutes');

  select count(*) into v_count
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001';

  if v_count <> 1 then
    raise exception 'TEST 8 FAILED: expected exactly 1 location row, got %', v_count;
  end if;

  raise notice 'TEST 8 PASSED: no historical location trail exposed';
end
$$;
rollback;


-- ===========================================================================
-- TEST 8A: Cross-tenant stop references are not exposed. This intentionally
--          mutates Student A's assignment inside a transaction to point at
--          Tenant B stops. The hardened RPC must keep the route row visible but
--          suppress cross-tenant stop names.
-- ===========================================================================
begin;
update public.student_route_assignments
set pickup_stop_id = '0e000000-0000-0000-0000-000000000005',
    dropoff_stop_id = '0e000000-0000-0000-0000-000000000006'
where id = '0f100000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8A FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8A FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select student_id, pickup_stop_name, dropoff_stop_name
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then
    raise exception 'TEST 8A FAILED: Guardian A route row disappeared';
  end if;
  if v_rows.pickup_stop_name is not null or v_rows.dropoff_stop_name is not null then
    raise exception 'TEST 8A FAILED: cross-tenant stop names leaked: %, %', v_rows.pickup_stop_name, v_rows.dropoff_stop_name;
  end if;

  raise notice 'TEST 8A PASSED: cross-tenant stop references are not exposed';
end
$$;
rollback;

-- ===========================================================================
-- TEST 8B: Same-tenant but wrong-route stop references are not exposed.
--          Student A remains assigned to Route A1 while pickup/dropoff point to
--          Route A2 stops. The hardened RPC must suppress those stop names.
-- ===========================================================================
begin;
update public.student_route_assignments
set pickup_stop_id = '0e000000-0000-0000-0000-000000000003',
    dropoff_stop_id = '0e000000-0000-0000-0000-000000000004'
where id = '0f100000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8B FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8B FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select student_id, pickup_stop_name, dropoff_stop_name
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then
    raise exception 'TEST 8B FAILED: Guardian A route row disappeared';
  end if;
  if v_rows.pickup_stop_name is not null or v_rows.dropoff_stop_name is not null then
    raise exception 'TEST 8B FAILED: wrong-route stop names leaked: %, %', v_rows.pickup_stop_name, v_rows.dropoff_stop_name;
  end if;

  raise notice 'TEST 8B PASSED: wrong-route stop references are not exposed';
end
$$;
rollback;

-- ===========================================================================
-- TEST 8C: Cross-tenant bus on an active trip does not expose that trip/location.
--          The schema permits driver_trips.bus_id to reference any public.buses
--          row by UUID, so this test creates malformed data by moving Trip 3 out
--          of the way and pointing Trip 1 at Tenant B's bus. The hardened RPC's
--          same-tenant bus join must make Student A appear with no active trip.
-- ===========================================================================
begin;
update public.driver_trips
set status = 'completed', ended_at = now()
where id = '1a200000-0000-0000-0000-000000000003';
update public.driver_trips
set bus_id = '0c000000-0000-0000-0000-000000000002'
where id = '1a200000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8C FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8C FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select student_id, has_active_trip, last_location_latitude, last_location_longitude
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then
    raise exception 'TEST 8C FAILED: Guardian A route row disappeared';
  end if;
  if v_rows.has_active_trip is not false then
    raise exception 'TEST 8C FAILED: malformed cross-tenant-bus trip was treated as active';
  end if;
  if v_rows.last_location_latitude is not null or v_rows.last_location_longitude is not null then
    raise exception 'TEST 8C FAILED: location exposed for cross-tenant-bus trip';
  end if;

  raise notice 'TEST 8C PASSED: cross-tenant bus on active trip is not exposed';
end
$$;
rollback;

-- ===========================================================================
-- TEST 8D: Mismatched current-location route/bus is not exposed. The table has
--          one current-location row per trip, so this test mutates the existing
--          current row to a mismatched same-tenant route and then to a mismatched
--          cross-tenant bus. In both cases, active trip status may remain true,
--          but the mismatched latitude/longitude must be suppressed.
-- ===========================================================================
begin;
update public.driver_trip_current_locations
set route_id = '0d000000-0000-0000-0000-000000000002',
    latitude = 52.0001,
    longitude = -115.0001
where driver_trip_id = '1a200000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8D FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8D FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select has_active_trip, last_location_latitude, last_location_longitude
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then
    raise exception 'TEST 8D FAILED: Guardian A route row disappeared during route mismatch check';
  end if;
  if v_rows.has_active_trip is not true then
    raise exception 'TEST 8D FAILED: active trip should remain visible while mismatched location is suppressed';
  end if;
  if v_rows.last_location_latitude is not null or v_rows.last_location_longitude is not null then
    raise exception 'TEST 8D FAILED: mismatched route location leaked: %, %', v_rows.last_location_latitude, v_rows.last_location_longitude;
  end if;
end
$$;
rollback;

begin;
update public.driver_trip_current_locations
set bus_id = '0c000000-0000-0000-0000-000000000002',
    latitude = 53.0001,
    longitude = -116.0001
where driver_trip_id = '1a200000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_rows record;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 8D FAILED: auth.uid() simulation failed during bus mismatch check: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 8D FAILED: expected guardian during bus mismatch check, got %', public.current_user_role();
  end if;

  select has_active_trip, last_location_latitude, last_location_longitude
  into v_rows
  from public.get_guardian_live_trip_visibility()
  where student_id = '0a000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then
    raise exception 'TEST 8D FAILED: Guardian A route row disappeared during bus mismatch check';
  end if;
  if v_rows.has_active_trip is not true then
    raise exception 'TEST 8D FAILED: active trip should remain visible while bus-mismatched location is suppressed';
  end if;
  if v_rows.last_location_latitude is not null or v_rows.last_location_longitude is not null then
    raise exception 'TEST 8D FAILED: mismatched bus location leaked: %, %', v_rows.last_location_latitude, v_rows.last_location_longitude;
  end if;

  raise notice 'TEST 8D PASSED: mismatched current-location route/bus is not exposed';
end
$$;
rollback;

-- ===========================================================================
-- TEST 9: Driver CANNOT call the guardian live visibility RPC.
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 9 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 9 FAILED: expected driver, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_live_trip_visibility();

  if v_count <> 0 then
    raise exception 'TEST 9 FAILED: driver got % rows from guardian RPC', v_count;
  end if;

  raise notice 'TEST 9 PASSED: driver gets no rows from guardian RPC';
end
$$;
rollback;

-- ===========================================================================
-- TEST 10: Tenant admin CANNOT call the guardian live visibility RPC (default deny).
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 10 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 10 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_live_trip_visibility();

  if v_count <> 0 then
    raise exception 'TEST 10 FAILED: tenant_admin got % rows from guardian RPC', v_count;
  end if;

  raise notice 'TEST 10 PASSED: tenant_admin gets no rows from guardian RPC';
end
$$;
rollback;

-- ===========================================================================
-- TEST 11: Unauthenticated (anon) access is denied.
--
-- Execute is revoked from anon, so the RPC call must raise
-- insufficient_privilege (permission denied for function). If a Supabase build
-- instead allows the call to reach the function body, the SECURITY DEFINER
-- function's own `auth.uid() is not null` guard returns zero rows. Both
-- outcomes are acceptable; any non-zero row count fails the test.
-- ===========================================================================
begin;
set local role anon;
do $$
declare
  v_count int;
begin
  if auth.uid() is not null then
    raise exception 'TEST 11 FAILED: expected anon auth.uid() NULL, got %', auth.uid();
  end if;

  begin
    select count(*) into v_count from public.get_guardian_live_trip_visibility();
    if v_count <> 0 then
      raise exception 'TEST 11 FAILED: anon got % rows from guardian RPC', v_count;
    end if;
    raise notice 'TEST 11 PASSED: anon got 0 rows from guardian RPC (execute not blocked but body guard held)';
  exception
    when insufficient_privilege then
      raise notice 'TEST 11 PASSED: anon blocked from executing guardian RPC (permission denied)';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 12: Existing guardian route visibility RPC still works for Guardian A.
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 12 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 12 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  -- The pre-existing 0015 RPC must still return Guardian A's actively linked student.
  select coalesce(array_agg(student_id order by student_id), array[]::uuid[]) into v_ids
  from public.get_guardian_student_route_visibility();

  if v_ids <> array['0a000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'TEST 12 FAILED: existing guardian route RPC returned unexpected rows: %', v_ids;
  end if;

  raise notice 'TEST 12 PASSED: existing guardian route visibility RPC still works';
end
$$;
rollback;

-- ===========================================================================
-- TEST 13: Guardian-linking RLS tests remain valid — Guardian A can read
--          only own visible student_guardians link rows and never Guardian B's link.
--          Some hosted policies intentionally hide inactive links from guardians,
--          so inactive-link existence is verified in TEST 4's privileged sanity
--          check instead of being required in the guardian-visible result set.
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '08000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"08000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_link_ids uuid[];
begin
  if auth.uid() <> '08000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 13 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 13 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  -- Guardian A should see exactly the visible own active link and NOT
  -- Guardian B's link. Inactive-link exclusion is acceptable and separately
  -- verified not to surface through the live-trip RPC.
  select coalesce(array_agg(id order by id), array[]::uuid[]) into v_link_ids
  from public.student_guardians;

  if v_link_ids <> array[
    '0b000000-0000-0000-0000-000000000001'::uuid
  ] then
    raise exception 'TEST 13 FAILED: unexpected Guardian A link rows: %', v_link_ids;
  end if;

  raise notice 'TEST 13 PASSED: guardian-linking RLS still isolates links to own guardian';
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS (only this file's fixed IDs)
-- ===========================================================================

delete from public.driver_trip_current_locations where driver_trip_id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trip_location_updates where driver_trip_id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002'
);

delete from public.driver_trips where id in (
  '1a200000-0000-0000-0000-000000000001',
  '1a200000-0000-0000-0000-000000000002',
  '1a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '0f100000-0000-0000-0000-000000000001',
  '0f100000-0000-0000-0000-000000000002',
  '0f100000-0000-0000-0000-000000000003',
  '0f100000-0000-0000-0000-000000000004'
);

delete from public.route_stops where id in (
  '0e000000-0000-0000-0000-000000000001',
  '0e000000-0000-0000-0000-000000000002',
  '0e000000-0000-0000-0000-000000000003',
  '0e000000-0000-0000-0000-000000000004',
  '0e000000-0000-0000-0000-000000000005',
  '0e000000-0000-0000-0000-000000000006'
);

delete from public.routes where id in (
  '0d000000-0000-0000-0000-000000000001',
  '0d000000-0000-0000-0000-000000000002',
  '0d000000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '0c000000-0000-0000-0000-000000000001',
  '0c000000-0000-0000-0000-000000000002'
);

delete from public.student_guardians where id in (
  '0b000000-0000-0000-0000-000000000001',
  '0b000000-0000-0000-0000-000000000002',
  '0b000000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '0a000000-0000-0000-0000-000000000001',
  '0a000000-0000-0000-0000-000000000002',
  '0a000000-0000-0000-0000-000000000003',
  '0a000000-0000-0000-0000-000000000004'
);

delete from public.guardians where id in (
  '09000000-0000-0000-0000-000000000001',
  '09000000-0000-0000-0000-000000000002'
);

delete from public.drivers where id in (
  '09000000-0000-0000-0000-000000000003',
  '09000000-0000-0000-0000-000000000004'
);

delete from public.profiles where id in (
  '08000000-0000-0000-0000-000000000001',
  '08000000-0000-0000-0000-000000000002',
  '08000000-0000-0000-0000-000000000003',
  '08000000-0000-0000-0000-000000000004',
  '08000000-0000-0000-0000-000000000005'
);

delete from auth.users where id in (
  '08000000-0000-0000-0000-000000000001',
  '08000000-0000-0000-0000-000000000002',
  '08000000-0000-0000-0000-000000000003',
  '08000000-0000-0000-0000-000000000004',
  '08000000-0000-0000-0000-000000000005'
);

delete from public.schools where id in (
  '07000000-0000-0000-0000-000000000001',
  '07000000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '06000000-0000-0000-0000-000000000001',
  '06000000-0000-0000-0000-000000000002'
);
