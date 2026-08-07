-- SafeBus Alberta - Phase 1 authorization reconciliation
--
-- Phase 1 (Critical database and authorization repair) corrective migration.
-- This migration is forward-only and performs FOUR jobs:
--
--   1. PLATFORM ISOLATION
--      Remove platform-admin direct SELECT on tenant personal/operational
--      tables. Platform admins keep access ONLY to the narrow control-plane
--      surface defined in data-classification.md §6 and already implemented
--      by get_platform_tenant_onboarding_summary().
--
--   2. DRIVER AUTHORIZATION TIGHTENING
--      Remove the over-broad driver policies that let any active driver read
--      ALL active tenant buses and routes. Replace with assignment-derived
--      access so a driver sees only their assigned bus, assigned route,
--      active trip, and the minimum manifest for that trip.
--
--   3. OBSOLETE LOCATION-INGESTION QUARANTINE
--      Retire the old browser-source update_driver_trip_location() RPC.
--      Location writes now go exclusively through the session-bound
--      update_bus_tracking_location() RPC (migration 0059). The old RPC is
--      replaced with a stub that always raises, preserving the function
--      signature for rollback safety without accepting writes.
--
--   4. COLLISION ASSERTION (drift detection)
--      Assert that the canonical schema objects exist so that environments
--      that applied a losing duplicate can be detected.
--
-- No student, guardian, driver, route, stop, manifest, or location data is
-- exposed to platform administrators by this migration. Direct REST/database
-- calls cannot bypass these policies because RLS is the enforcement layer.

-- ===========================================================================
-- 1. PLATFORM ISOLATION
-- ===========================================================================
-- Remove platform-admin SELECT on profiles (tenant user accounts). Platform
-- admins must use get_platform_tenant_onboarding_summary() for the narrow
-- onboarding-status view; they no longer receive routine profile reads.
drop policy if exists "profiles select platform admin" on public.profiles;
drop policy if exists "schools select platform admin" on public.schools;
drop policy if exists "students select platform admin" on public.students;
drop policy if exists "guardians select platform admin" on public.guardians;
drop policy if exists "student guardians select platform admin" on public.student_guardians;

-- Remove platform-admin SELECT on driver/guardian invitation records. The
-- platform summary RPC reads invitations internally via SECURITY DEFINER
-- (lifecycle status only); the direct table policy is removed so platform
-- admins cannot enumerate invitation personal data.
drop policy if exists "tenant onboarding select platform admin" on public.tenant_onboarding_invitations;

-- Remove platform-admin SELECT on route geometry (added in 0057). Route
-- geometry is Confidential per data-classification.md and is never exposed
-- to platform functions.
drop policy if exists "route_shapes select platform admin" on public.route_shapes;

-- Defense-in-depth: any remaining platform-admin read policies on operational
-- tables that were missed by 0036 are removed here. These are idempotent drops.
drop policy if exists "buses select platform admin" on public.buses;
drop policy if exists "drivers select platform admin" on public.drivers;
drop policy if exists "routes select platform admin" on public.routes;
drop policy if exists "route stops select platform admin" on public.route_stops;
drop policy if exists "driver_trips select platform admin" on public.driver_trips;
drop policy if exists "driver_trip_location_updates select platform admin" on public.driver_trip_location_updates;
drop policy if exists "driver_trip_current_locations select platform admin" on public.driver_trip_current_locations;
drop policy if exists "student_bus_assignments select platform admin" on public.student_bus_assignments;
drop policy if exists "bus_route_assignments select platform admin" on public.bus_route_assignments;
drop policy if exists "driver_route_assignments select platform admin" on public.driver_route_assignments;
drop policy if exists "student route assignments select platform admin" on public.student_route_assignments;
drop policy if exists "route_trip_patterns select platform admin" on public.route_trip_patterns;

-- Quarantine the Phase 0 D1 student-badge drift on environments that applied
-- the losing 0043 migration before it was archived. Drop functions before
-- removing the table so no child QR surface remains reachable.
drop function if exists public.resolve_student_qr_for_active_trip(text);
drop function if exists public.get_admin_student_qr_credential_status(uuid);
drop function if exists public.manage_student_qr_credential(uuid, text);
drop function if exists public.create_student_qr_token();
drop function if exists public.hash_student_qr_token(text);
drop table if exists public.student_qr_credentials;

-- Platform admins retain access to tenants (lifecycle control) and the
-- platform onboarding summary RPC. No change to those policies here.

-- ===========================================================================
-- 2. DRIVER AUTHORIZATION TIGHTENING
-- ===========================================================================
-- Remove the over-broad driver policies that let any active tenant driver
-- read ALL active buses and routes. A driver must see only:
--   - their assigned bus (via active assignment or active trip)
--   - their assigned route (via active assignment or active trip)
--   - their active trip
--   - the minimum manifest for that active trip
--
-- These helper policies are assignment-derived and expire automatically when
-- the assignment ends (because the assignment row's status/effective window
-- gates the join).

-- Remove over-broad "all active tenant buses/routes" driver policies.
drop policy if exists "buses select driver tenant active" on public.buses;
drop policy if exists "routes select driver tenant active" on public.routes;

-- Replace with assignment-derived driver visibility. A driver may read a bus
-- only if they have an active driver_route_assignment or an active driver_trip
-- on that bus in their tenant today.
create policy "buses select assigned driver"
  on public.buses for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and (
      exists (
        select 1
        from public.driver_route_assignments dra
        where dra.bus_id = buses.id
          and dra.tenant_id = buses.tenant_id
          and dra.driver_id = public.current_driver_id()
          and dra.status = 'active'
          and (dra.effective_from is null or dra.effective_from <= current_date)
          and (dra.effective_to is null or dra.effective_to >= current_date)
      )
      or exists (
        select 1
        from public.driver_trips dt
        where dt.bus_id = buses.id
          and dt.tenant_id = buses.tenant_id
          and dt.driver_id = public.current_driver_id()
          and dt.status = 'active'
      )
    )
  );

-- A driver may read a route only if they have an active assignment or active
-- trip on that route in their tenant today.
create policy "routes select assigned driver"
  on public.routes for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and (
      exists (
        select 1
        from public.driver_route_assignments dra
        where dra.route_id = routes.id
          and dra.tenant_id = routes.tenant_id
          and dra.driver_id = public.current_driver_id()
          and dra.status = 'active'
          and (dra.effective_from is null or dra.effective_from <= current_date)
          and (dra.effective_to is null or dra.effective_to >= current_date)
      )
      or exists (
        select 1
        from public.driver_trips dt
        where dt.route_id = routes.id
          and dt.tenant_id = routes.tenant_id
          and dt.driver_id = public.current_driver_id()
          and dt.status = 'active'
      )
    )
  );

-- ===========================================================================
-- 3. OBSOLETE LOCATION-INGESTION QUARANTINE
-- ===========================================================================
-- Retire the old browser-source location RPC. Replace with a stub that always
-- raises so the function signature is preserved (rollback safety) but no
-- writes are accepted. The authoritative path is update_bus_tracking_location
-- (migration 0059), which derives driver/trip/bus/route from a hashed session
-- token and never accepts those identifiers from the client.
drop function if exists public.update_driver_trip_location(
  uuid, double precision, double precision, double precision,
  double precision, double precision, text
);

create or replace function public.update_driver_trip_location(
  p_driver_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null,
  p_source text default null
)
returns public.driver_trip_current_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception
    'update_driver_trip_location is retired. Location writes must use update_bus_tracking_location(text, ...) with a valid bus tracking session token.'
    using errcode = '55006';
end;
$$;

revoke all on function public.update_driver_trip_location(
  uuid, double precision, double precision, double precision,
  double precision, double precision, text
) from public, anon, authenticated;

comment on function public.update_driver_trip_location(
  uuid, double precision, double precision, double precision,
  double precision, double precision, text
) is
  'Retired browser-source location RPC. Always raises. Location writes must use update_bus_tracking_location(text, ...) which binds the driver phone to the bus via a hashed session token.';

-- ===========================================================================
-- 4. COLLISION ASSERTION (drift detection)
-- ===========================================================================
-- Assert that the canonical winner objects exist. If an environment applied
-- a losing duplicate and is missing a canonical object, these assertions
-- fail loudly so the operator can reconcile before proceeding.
do $$
begin
  -- 0042 winner: student onboarding RPCs
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_create_student_onboarding'
  ) then
    raise exception 'Canonical object missing: admin_create_student_onboarding. See docs/migration-ledger.md 0042 collision.';
  end if;

  -- 0043 winner: people directory columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_name'
  ) then
    raise exception 'Canonical object missing: profiles.first_name. See docs/migration-ledger.md 0043 collision.';
  end if;

  -- 0058 canonical: both independent RPCs must exist
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_admin_trip_overview'
  ) then
    raise exception 'Canonical object missing: get_admin_trip_overview. See docs/migration-ledger.md 0058 collision.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_admin_bus_workspace'
  ) then
    raise exception 'Canonical object missing: get_admin_bus_workspace. See docs/migration-ledger.md 0058 collision.';
  end if;

  -- Platform isolation: the retired policies must not exist.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles select platform admin'
  ) then
    raise exception 'platform-admin profiles policy still present after 0065.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_onboarding_invitations'
      and policyname = 'tenant onboarding select platform admin'
  ) then
    raise exception 'platform-admin invitation policy still present after 0065.';
  end if;

  -- Driver authorization: over-broad policies must not exist.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'buses'
      and policyname = 'buses select driver tenant active'
  ) then
    raise exception 'Over-broad driver buses policy still present after 0065.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'routes'
      and policyname = 'routes select driver tenant active'
  ) then
    raise exception 'Over-broad driver routes policy still present after 0065.';
  end if;

  raise notice '0065 collision and authorization assertions passed.';
end;
$$;
