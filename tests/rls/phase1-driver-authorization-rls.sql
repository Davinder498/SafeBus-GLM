-- SafeBus Alberta - Phase 1 driver authorization RLS regression
--
-- Migration 0065 §2 removes the over-broad driver policies that let any active
-- tenant driver read ALL active buses and routes. Drivers now see only:
--   - their assigned bus (via active driver_route_assignment or active trip)
--   - their assigned route (via active driver_route_assignment or active trip)
--   - their active trip
--   - the minimum manifest for that active trip
--
-- This test verifies the Phase 1 driver-authorization exit gate:
--   - The over-broad policies ("buses select driver tenant active",
--     "routes select driver tenant active") no longer exist.
--   - The new assignment-derived policies exist.
--   - A driver with NO assignment/trip sees zero buses and zero routes.
--   - A driver WITH an active assignment sees only assigned buses/routes.
--   - A driver cannot read another driver's assigned bus/route.
--   - The retired browser-source location RPC always raises.
--
-- SELF-CONTAINED: seeds its own tenant, driver profiles, buses, routes, trip
-- patterns, and assignments with disjoint fixed IDs, then cleans up.
--
-- Run after applying migration 0065 to hosted Supabase DEV or a disposable
-- migrated database. Never run against production.

-- ===========================================================================
-- Privileged setup
-- ===========================================================================
do $$
declare
  v_tenant_id uuid := '13131313-1313-1313-1313-131313131313';
  v_driver_a_user uuid := '14141414-1414-1414-1414-141414141414';
  v_driver_b_user uuid := '15151515-1515-1515-1515-151515151515';
  v_driver_a_row uuid := '16161616-1616-1616-1616-161616161616';
  v_driver_b_row uuid := '17171717-1717-1717-1717-171717171717';
  v_bus_a uuid := '18181818-1818-1818-1818-181818181818';
  v_bus_b uuid := '19191919-1919-1919-1919-191919191919';
  v_route_a uuid := '20202020-2020-2020-2020-202020202020';
  v_route_b uuid := '21212121-2121-2121-2121-212121212121';
begin
  insert into public.tenants (id, name, type, status)
  values (v_tenant_id, 'Phase1 Driver Auth Test Tenant', 'demo', 'active')
  on conflict (id) do nothing;

  -- Driver A and B auth users + profiles + driver rows.
  -- Profiles need first_name/last_name (NOT NULL after migration 0043).
  insert into auth.users (id, email, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_driver_a_user, 'phase1.driver.a@example.test', 'authenticated','authenticated', now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_driver_b_user, 'phase1.driver.b@example.test', 'authenticated','authenticated', now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do nothing;

  insert into public.profiles (id, tenant_id, full_name, first_name, last_name, email, role, status)
  values
    (v_driver_a_user, v_tenant_id, 'Driver A', 'Driver', 'A', 'phase1.driver.a@example.test', 'driver', 'active'),
    (v_driver_b_user, v_tenant_id, 'Driver B', 'Driver', 'B', 'phase1.driver.b@example.test', 'driver', 'active')
  on conflict (id) do nothing;

  insert into public.drivers (id, tenant_id, profile_id, status)
  values
    (v_driver_a_row, v_tenant_id, v_driver_a_user, 'active'),
    (v_driver_b_row, v_tenant_id, v_driver_b_user, 'active')
  on conflict (id) do nothing;

  -- Two buses.
  insert into public.buses (id, tenant_id, bus_number, status)
  values
    (v_bus_a, v_tenant_id, 'PHASE1-A', 'active'),
    (v_bus_b, v_tenant_id, 'PHASE1-B', 'active')
  on conflict (id) do nothing;

  -- Two routes. Must include route_kind and map_color (NOT NULL after 0045).
  insert into public.routes (id, tenant_id, route_name, route_code, route_type, route_kind, map_color, definition_status, status)
  values
    (v_route_a, v_tenant_id, 'Phase1 Route A', 'P1-A', 'morning', 'regular', '#AABBCC', 'incomplete', 'active'),
    (v_route_b, v_tenant_id, 'Phase1 Route B', 'P1-B', 'morning', 'regular', '#DDEEFF', 'incomplete', 'active')
  on conflict (id) do nothing;

  -- Every route must have exactly one forward and one reverse trip pattern
  -- (enforced by the deferred constraint trigger validate_route_trip_pattern_pair).
  insert into public.route_trip_patterns (tenant_id, route_id, direction, display_name, status, schedule_review_required)
  values
    (v_tenant_id, v_route_a, 'forward', 'P1-A Outbound', 'active', true),
    (v_tenant_id, v_route_a, 'reverse', 'P1-A Return', 'active', true),
    (v_tenant_id, v_route_b, 'forward', 'P1-B Outbound', 'active', true),
    (v_tenant_id, v_route_b, 'reverse', 'P1-B Return', 'active', true)
  on conflict (route_id, direction) do nothing;

  -- Only Driver A has an active assignment (Bus A / Route A). Driver B has none.
  -- route_trip_pattern_id is left NULL so the readiness trigger does not fire
  -- (it only gates when route_trip_pattern_id is not null).
  insert into public.driver_route_assignments (id, tenant_id, driver_id, bus_id, route_id, status, effective_from)
  values (gen_random_uuid(), v_tenant_id, v_driver_a_row, v_bus_a, v_route_a, 'active', current_date)
  on conflict (id) do nothing;
end $$;

-- ===========================================================================
-- Test 1: retired over-broad policies must not exist
-- ===========================================================================
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'buses select driver tenant active',
      'routes select driver tenant active'
    );

  if v_count > 0 then
    raise exception 'Phase1 FAIL: % over-broad driver policies still exist after migration 0065.', v_count;
  end if;

  -- New assignment-derived policies must exist.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'buses select assigned driver',
      'routes select assigned driver'
    );

  if v_count < 2 then
    raise exception 'Phase1 FAIL: assignment-derived driver policies missing after migration 0065.';
  end if;

  raise notice 'Phase1 PASS: over-broad driver policies removed; assignment-derived policies present.';
end $$;

-- ===========================================================================
-- Test 2: Driver A (has assignment) sees only assigned Bus A / Route A
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '14141414-1414-1414-1414-141414141414';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"14141414-1414-1414-1414-141414141414","role":"authenticated"}';

do $$
declare
  v_role text;
  v_driver_id uuid;
  v_bus_count integer;
  v_route_count integer;
  v_seen_bus_numbers text;
begin
  v_role := public.current_user_role();
  if v_role is distinct from 'driver' then
    raise exception 'Phase1 FAIL: expected driver role, got %', v_role;
  end if;

  v_driver_id := public.current_driver_id();
  if v_driver_id is null then
    raise exception 'Phase1 FAIL: Driver A current_driver_id() resolved null.';
  end if;

  -- Driver A must see exactly 1 bus (PHASE1-A) and 1 route (P1-A).
  select count(*) into v_bus_count from public.buses;
  select count(*) into v_route_count from public.routes;

  if v_bus_count <> 1 then
    raise exception 'Phase1 FAIL: Driver A saw % buses (expected 1).', v_bus_count;
  end if;
  if v_route_count <> 1 then
    raise exception 'Phase1 FAIL: Driver A saw % routes (expected 1).', v_route_count;
  end if;

  select string_agg(bus_number, ',') into v_seen_bus_numbers from public.buses;
  if v_seen_bus_numbers is distinct from 'PHASE1-A' then
    raise exception 'Phase1 FAIL: Driver A saw bus % (expected PHASE1-A).', v_seen_bus_numbers;
  end if;

  raise notice 'Phase1 PASS: Driver A sees only assigned Bus A and Route A.';
end $$;

rollback;

-- ===========================================================================
-- Test 3: Driver B (NO assignment, NO active trip) sees zero buses/routes
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = '15151515-1515-1515-1515-151515151515';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"15151515-1515-1515-1515-151515151515","role":"authenticated"}';

do $$
declare
  v_bus_count integer;
  v_route_count integer;
begin
  select count(*) into v_bus_count from public.buses;
  select count(*) into v_route_count from public.routes;

  if v_bus_count <> 0 then
    raise exception 'Phase1 FAIL: unassigned Driver B saw % buses (expected 0).', v_bus_count;
  end if;
  if v_route_count <> 0 then
    raise exception 'Phase1 FAIL: unassigned Driver B saw % routes (expected 0).', v_route_count;
  end if;

  raise notice 'Phase1 PASS: unassigned Driver B sees zero buses and zero routes.';
end $$;

rollback;

-- ===========================================================================
-- Test 4: retired browser-source location RPC always raises
-- ===========================================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform public.update_driver_trip_location(
      '00000000-0000-0000-0000-000000000001'::uuid,
      51.0, -114.0, null, null, null, 'browser'
    );
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'Phase1 FAIL: retired update_driver_trip_location did not raise.';
  end if;

  raise notice 'Phase1 PASS: retired update_driver_trip_location always raises.';
end $$;

-- ===========================================================================
-- Cleanup
-- ===========================================================================
do $$
declare
  v_tenant_id uuid := '13131313-1313-1313-1313-131313131313';
  v_bus_a uuid := '18181818-1818-1818-1818-181818181818';
  v_bus_b uuid := '19191919-1919-1919-1919-191919191919';
  v_route_a uuid := '20202020-2020-2020-2020-202020202020';
  v_route_b uuid := '21212121-2121-2121-2121-212121212121';
  v_driver_a_user uuid := '14141414-1414-1414-1414-141414141414';
  v_driver_b_user uuid := '15151515-1515-1515-1515-151515151515';
begin
  delete from public.driver_route_assignments where tenant_id = v_tenant_id
    and bus_id in (v_bus_a, v_bus_b);
  delete from public.route_trip_patterns where tenant_id = v_tenant_id
    and route_id in (v_route_a, v_route_b);
  delete from public.routes where tenant_id = v_tenant_id
    and id in (v_route_a, v_route_b);
  delete from public.buses where tenant_id = v_tenant_id
    and id in (v_bus_a, v_bus_b);
  delete from public.drivers where tenant_id = v_tenant_id
    and id in ('16161616-1616-1616-1616-161616161616','17171717-1717-1717-1717-171717171717');
  delete from public.profiles where id in (v_driver_a_user, v_driver_b_user);
  delete from auth.users where id in (v_driver_a_user, v_driver_b_user);
  delete from public.tenants where id = v_tenant_id;
end $$;