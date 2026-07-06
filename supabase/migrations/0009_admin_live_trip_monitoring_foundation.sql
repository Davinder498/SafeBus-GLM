-- SafeBus Alberta - admin live trip monitoring foundation
--
-- Milestone 4C: tenant-safe admin/transportation read RPC for monitoring active
-- driver trips and their latest location status.
--
-- This migration is additive only. It creates a single SECURITY DEFINER RPC and
-- grants execute to authenticated users. It does NOT create, alter, or drop any
-- table. It does NOT change any existing RLS policy or grant. It does NOT add
-- any parent-facing access (parent live tracking is a later milestone).
--
-- Security model:
--   get_admin_live_trip_monitoring() is the single read path admins use to see
--   active trips in their organization. It is SECURITY DEFINER with
--   set search_path = public, so it executes as its owner and BYPASSES the
--   table-level RLS policies on driver_trips, driver_trip_current_locations,
--   drivers, profiles, buses, and routes for the duration of the call. The REAL
--   security guarantee is therefore the function's own explicit checks:
--     1. auth.uid() is not null (caller is authenticated)
--     2. current_user_role() is one of the admin roles
--        (platform_super_admin, tenant_admin, school_admin,
--        transportation_admin)
--     3. every returned trip row has tenant_id = current_tenant_id()
--        (platform_super_admin sees all tenants; other admins see only their
--        own tenant)
--   These checks are the primary enforcement. The existing RLS policies remain
--   in force for all direct (non-RPC) client SELECTs; they are simply not
--   relied upon inside this function.
--
-- The RPC returns only safe operational fields. It does not expose service-role
-- internals, ASN, student data, home addresses, or health data. It LEFT JOINs
-- driver_trip_current_locations so active trips without a location still appear.

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
    and (
      public.is_platform_super_admin()
      or (
        public.current_user_role() in (
          'tenant_admin', 'school_admin', 'transportation_admin'
        )
        and dt.tenant_id = public.current_tenant_id()
      )
    )
  order by dt.started_at desc;
$$;

comment on function public.get_admin_live_trip_monitoring() is
  'Tenant-safe admin read of active driver trips with latest location. '
  'Returns only active trips. Platform super admins see all tenants; other '
  'admins (tenant_admin, school_admin, transportation_admin) see only their '
  'own tenant. LEFT JOINs driver_trip_current_locations so trips without a '
  'location still appear. SECURITY DEFINER; internal role/tenant checks are '
  'the primary enforcement (table RLS is bypassed inside the function).';

-- Grant execute to authenticated users only. The function's internal checks
-- reject non-admin callers by returning zero rows (the role predicate filters
-- them out). No grant to anon/public.
grant execute on function public.get_admin_live_trip_monitoring() to authenticated;
