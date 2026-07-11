-- SafeBus Alberta - admin live fleet map and speed monitoring
--
-- Milestone 10A: narrow tenant-admin RPC for operational live fleet status.
-- The frontend must not read live location tables directly. This RPC returns
-- only active trips in the caller's current tenant and only safe operational
-- display fields (no student/guardian data, contact data, tenant IDs, or raw
-- internal trip/bus/route/driver UUIDs).

create or replace function public.get_admin_live_fleet_monitoring()
returns table (
  bus_label text,
  route_name text,
  driver_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz,
  speed_mps double precision,
  location_status text,
  issue_label text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    b.bus_number as bus_label,
    r.route_name,
    p.full_name as driver_name,
    dt.trip_type,
    dt.status,
    dt.started_at,
    loc.latitude as latest_latitude,
    loc.longitude as latest_longitude,
    loc.recorded_at as latest_location_at,
    loc.speed_mps,
    case
      when loc.recorded_at is null then 'missing'
      when loc.recorded_at < now() - interval '2 minutes' then 'stale'
      else 'live'
    end as location_status,
    case
      when loc.recorded_at is null then 'Missing GPS'
      when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS'
      when loc.speed_mps is null then 'Speed unavailable'
      else 'OK'
    end as issue_label
  from public.driver_trips dt
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = dt.id
   and loc.tenant_id = dt.tenant_id
   and loc.driver_id = dt.driver_id
   and loc.bus_id = dt.bus_id
   and loc.route_id = dt.route_id
  where dt.status = 'active'
    and auth.uid() is not null
    and dt.tenant_id = public.current_tenant_id()
    and public.current_user_role() in (
      'platform_super_admin',
      'tenant_admin',
      'school_admin',
      'transportation_admin'
    )
  order by
    case
      when loc.recorded_at is null then 0
      when loc.recorded_at < now() - interval '2 minutes' then 1
      else 2
    end,
    dt.started_at desc;
$$;

comment on function public.get_admin_live_fleet_monitoring() is
  'Tenant-safe admin read of active fleet monitoring data for Milestone 10A. '
  'Returns active trips in the caller current tenant with safe operational bus, '
  'route, driver display name, current coordinates, speed_mps when available, '
  'and server-derived live/stale/missing GPS status. Does not return tenant IDs, '
  'raw trip/bus/route/driver UUIDs, students, guardians, contact data, or history. '
  'SECURITY DEFINER with internal auth, role, and tenant checks; execute granted '
  'only to authenticated.';

revoke all on function public.get_admin_live_fleet_monitoring() from public;
revoke all on function public.get_admin_live_fleet_monitoring() from anon;
grant execute on function public.get_admin_live_fleet_monitoring() to authenticated;
