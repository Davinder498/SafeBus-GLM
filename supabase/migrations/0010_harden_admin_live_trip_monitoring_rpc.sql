-- SafeBus Alberta - harden admin live trip monitoring RPC security
--
-- Corrective migration for Milestone 4C Codex review blockers.
--
-- Background:
--   Migration 0009 created public.get_admin_live_trip_monitoring() as a
--   SECURITY DEFINER RPC. Codex identified two security issues:
--
--   1. PRIVILEGE HARDENING: Postgres functions grant EXECUTE to PUBLIC by
--      default at creation. Migration 0009 granted EXECUTE to authenticated
--      but did NOT explicitly REVOKE from public/anon. Although the function's
--      internal auth.uid() check returns zero rows for anonymous callers,
--      relying on that alone is not defense-in-depth. This migration makes the
--      privilege model explicit: revoke from public and anon, then grant to
--      authenticated only.
--
--   2. TENANT ISOLATION: Migration 0009 allowed platform_super_admin to see
--      active trips across ALL tenants (no tenant filter on that branch). For
--      Milestone 4C, every admin role — including platform_super_admin — must
--      be tenant-scoped to current_tenant_id(). This migration removes the
--      cross-tenant bypass so an admin from tenant A sees only tenant A's
--      active trips, regardless of role.
--
-- Approach:
--   Migration 0009 has already been merged to main and applied to hosted
--   Supabase DEV, so this is a new corrective migration (not an edit to 0009).
--   It CREATE OR REPLACEs the function with the hardened WHERE clause and then
--   issues the explicit REVOKE + GRANT. No tables are created, altered, or
--   dropped. No existing RLS policies are changed. The function signature is
--   unchanged, so no dependent code changes are needed.

create or replace function public.get_admin_live_trip_monitoring()
returns table (
  trip_id uuid,
  tenant_id uuid,
  driver_id uuid,
  driver_name text,
  driver_email text,
  bus_id uuid,
  bus_label text,
  route_id uuid,
  route_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    dt.id as trip_id,
    dt.tenant_id,
    dt.driver_id,
    p.full_name as driver_name,
    p.email as driver_email,
    dt.bus_id,
    b.bus_number as bus_label,
    dt.route_id,
    r.route_name,
    dt.trip_type,
    dt.status,
    dt.started_at,
    loc.latitude as latest_latitude,
    loc.longitude as latest_longitude,
    loc.recorded_at as latest_location_at
  from public.driver_trips dt
  join public.drivers d on d.id = dt.driver_id
  join public.profiles p on p.id = d.profile_id
  join public.buses b on b.id = dt.bus_id
  join public.routes r on r.id = dt.route_id
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = dt.id
  where dt.status = 'active'
    and auth.uid() is not null
    -- Tenant isolation: EVERY admin role is scoped to the caller's current
    -- tenant for Milestone 4C. platform_super_admin does NOT bypass this.
    -- An admin from tenant A sees only tenant A's active trips.
    and dt.tenant_id = public.current_tenant_id()
    and public.current_user_role() in (
      'platform_super_admin',
      'tenant_admin',
      'school_admin',
      'transportation_admin'
    )
  order by dt.started_at desc;
$$;

comment on function public.get_admin_live_trip_monitoring() is
  'Tenant-safe admin read of active driver trips with latest location. '
  'Returns only active trips in the caller''s current tenant (including for '
  'platform_super_admin — no cross-tenant access in this milestone). Allowed '
  'roles: platform_super_admin, tenant_admin, school_admin, '
  'transportation_admin. Drivers, guardians, and other roles get zero rows. '
  'LEFT JOINs driver_trip_current_locations so trips without a location still '
  'appear. SECURITY DEFINER; internal role/tenant checks are the primary '
  'enforcement (table RLS is bypassed inside the function). Execute is granted '
  'only to authenticated; public and anon are explicitly revoked.';

-- ---------------------------------------------------------------------------
-- Privilege hardening: make the execute grant model explicit.
-- Postgres grants EXECUTE on new functions to PUBLIC by default. Revoke that
-- default (and the anon role) so only authenticated users can execute, then
-- grant to authenticated. The function's internal auth.uid() check still
-- returns zero rows for any anonymous caller that somehow reaches it; this is
-- defense-in-depth.
-- ---------------------------------------------------------------------------
revoke all on function public.get_admin_live_trip_monitoring() from public;
revoke all on function public.get_admin_live_trip_monitoring() from anon;
grant execute on function public.get_admin_live_trip_monitoring() to authenticated;
