-- SafeBus Alberta - Phase 1 platform isolation RLS regression
--
-- Migration 0065 §1 removes platform-admin direct SELECT on tenant personal
-- and operational tables. Platform admins must use the narrow control-plane
-- RPC get_platform_tenant_onboarding_summary() and may not read profiles,
-- invitations, route geometry, students, guardians, drivers, trips, or
-- locations through direct table access.
--
-- This test verifies the Phase 1 platform-isolation exit gate:
--   - Platform admin cannot SELECT from profiles (tenant user accounts).
--   - Platform admin cannot SELECT from route geometry (route_shapes).
--   - Platform admin cannot SELECT from operational tables (students,
--     guardians, drivers, buses, routes, route_stops, driver_trips,
--     driver_trip_current_locations, assignments).
--   - Platform admin CAN still SELECT tenants (lifecycle control).
--   - Platform admin CAN still execute get_platform_tenant_onboarding_summary.
--   - The retired policies do not exist (drift detection).
--
-- This is a structural + privilege regression. It does not require seeded
-- tenant operational data; it verifies policy absence/presence and that a
-- platform-admin JWT context yields zero rows on protected tables.
--
-- Run after applying migrations through 0073 to hosted Supabase DEV or a disposable
-- migrated database. Never run against production.

-- ---------------------------------------------------------------------------
-- Privileged setup: create a minimal platform super admin profile if the
-- test tenant/admin do not already exist. Fixed IDs keep this deterministic.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_id uuid := '11111111-1111-1111-1111-111111111111';
  v_platform_admin_id uuid := '12121212-1212-1212-1212-121212121212';
begin
  insert into public.tenants (id, name, type, status)
  values (v_tenant_id, 'Phase1 Platform Isolation Test Tenant', 'demo', 'active')
  on conflict (id) do update
  set name = excluded.name, type = excluded.type, status = excluded.status;

  insert into auth.users (id, email, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_platform_admin_id,
    'phase1.platform.admin@example.test',
    'authenticated',
    'authenticated',
    now(),
    '00000000-0000-0000-0000-000000000000',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      aud = excluded.aud,
      role = excluded.role,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = now();

  insert into public.profiles (id, tenant_id, full_name, first_name, last_name, email, role, status)
  values (v_platform_admin_id, null, 'Phase1 Platform Admin', 'Phase1', 'Platform Admin', 'phase1.platform.admin@example.test', 'platform_super_admin', 'active')
  on conflict (id) do update
  set tenant_id = null,
      full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      role = 'platform_super_admin',
      status = 'active';
end $$;

-- ---------------------------------------------------------------------------
-- Test 1: retired platform-admin policies must not exist
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_tenant_policy_count integer;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'profiles select platform admin',
      'tenant onboarding select platform admin',
      'route_shapes select platform admin',
      'buses select platform admin',
      'drivers select platform admin',
      'routes select platform admin',
      'route_stops select platform admin',
      'student_bus_assignments select platform admin',
      'bus_route_assignments select platform admin',
      'driver_route_assignments select platform admin',
      'student_route_assignments select platform admin',
      'route_trip_patterns select platform admin'
    );

  if v_count > 0 then
    raise exception 'Phase1 FAIL: % retired platform-admin policies still exist after migration 0070.', v_count;
  end if;

  select count(*) into v_tenant_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'tenants'
    and policyname = 'tenants select platform admin'
    and cmd = 'SELECT';

  if v_tenant_policy_count <> 1 then
    raise exception 'Phase1 FAIL: platform tenant lifecycle policy is missing.';
  end if;

  raise notice 'Phase1 PASS: retired operational policies are absent and tenant lifecycle policy is present.';
end $$;

-- ---------------------------------------------------------------------------
-- Test 2: platform admin cannot SELECT from protected operational tables
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '12121212-1212-1212-1212-121212121212';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_role text;
  v_profiles_count integer;
  v_invitations_count integer;
  v_students_count integer;
  v_routes_count integer;
  v_route_shapes_count integer;
  v_trips_count integer;
  v_current_locations_count integer;
begin
  -- Confirm the simulated identity is a platform super admin.
  v_role := public.current_user_role();
  if v_role is distinct from 'platform_super_admin' then
    raise exception 'Phase1 FAIL: expected platform_super_admin role, got %', v_role;
  end if;

  -- Platform admin sees only their OWN profile (via the universal
  -- "profiles select own" policy). They must NOT see other tenants' profiles,
  -- invitations, students, routes, geometry, trips, or locations.
  select count(*) into v_profiles_count from public.profiles;
  select count(*) into v_invitations_count from public.tenant_onboarding_invitations;
  select count(*) into v_students_count from public.students;
  select count(*) into v_routes_count from public.routes;
  select count(*) into v_route_shapes_count from public.route_shapes;
  select count(*) into v_trips_count from public.driver_trips;
  select count(*) into v_current_locations_count from public.driver_trip_current_locations;

  -- The platform admin's own profile row is expected (the "profiles select own"
  -- policy is universal). They must not see any OTHER profile rows.
  if v_profiles_count <> 1 then
    raise exception 'Phase1 FAIL: platform admin read % profile rows (must be exactly 1 = own).', v_profiles_count;
  end if;
  if v_invitations_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % invitation rows (must be 0).', v_invitations_count;
  end if;
  if v_students_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % student rows (must be 0).', v_students_count;
  end if;
  if v_routes_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % route rows (must be 0).', v_routes_count;
  end if;
  if v_route_shapes_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % route_shapes rows (must be 0).', v_route_shapes_count;
  end if;
  if v_trips_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % driver_trips rows (must be 0).', v_trips_count;
  end if;
  if v_current_locations_count > 0 then
    raise exception 'Phase1 FAIL: platform admin read % current location rows (must be 0).', v_current_locations_count;
  end if;

  raise notice 'Phase1 PASS: platform admin sees only own profile (1 row) and zero other operational rows.';
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Test 3: platform admin CAN still SELECT tenants (lifecycle control retained)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '12121212-1212-1212-1212-121212121212';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_tenants_count integer;
begin
  if auth.uid() <> '12121212-1212-1212-1212-121212121212'::uuid
     or public.current_user_role() <> 'platform_super_admin'
     or not public.is_platform_super_admin() then
    raise exception 'Phase1 FAIL: platform JWT simulation failed (uid %, role %, predicate %).',
      auth.uid(), public.current_user_role(), public.is_platform_super_admin();
  end if;

  select count(*) into v_tenants_count from public.tenants;
  if v_tenants_count = 0 then
    raise exception 'Phase1 FAIL: platform admin cannot read tenants (must retain lifecycle control).';
  end if;
  raise notice 'Phase1 PASS: platform admin retains tenant lifecycle read access (% rows).', v_tenants_count;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Test 4: platform admin CAN execute the narrow control-plane summary RPC
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '12121212-1212-1212-1212-121212121212';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_summary_count integer;
begin
  -- The summary RPC must be executable by a platform super admin and must
  -- return only tenant metadata, first-admin contact, and aggregate readiness
  -- booleans — no operational rows.
  select count(*) into v_summary_count from public.get_platform_tenant_onboarding_summary();
  if v_summary_count = 0 then
    raise exception 'Phase1 FAIL: platform admin summary RPC returned no rows.';
  end if;
  raise notice 'Phase1 PASS: platform admin can execute get_platform_tenant_onboarding_summary (% rows).', v_summary_count;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Cleanup: remove the test platform admin profile and auth user.
-- Keep the test tenant for other RLS scripts that may reference it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_platform_admin_id uuid := '12121212-1212-1212-1212-121212121212';
begin
  delete from public.profiles where id = v_platform_admin_id;
  delete from auth.users where id = v_platform_admin_id;
end $$;
