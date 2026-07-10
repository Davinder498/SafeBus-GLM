-- SafeBus Alberta - driver active trip student manifest foundation
--
-- Milestone 7A: secure driver-only manifest visibility for the authenticated
-- driver's current active trip. This is an RPC-only read path; no broad table
-- policies or direct browser reads are added.
--
-- DELIBERATELY EXCLUDED:
--   - no QR codes, boarding/drop-off events, notifications, maps, GPS, ETA,
--     speed, guardian contact data, bus ids, driver contact data, or tenant ids
--     in the returned UI payload.
--
-- SECURITY MODEL:
--   This SECURITY DEFINER function bypasses table RLS internally, so its own
--   checks are the primary boundary:
--     1. auth.uid() is not null
--     2. caller role is exactly driver
--     3. caller has an active driver row in current_tenant_id()
--     4. only that driver's active trip in the same tenant is selected
--     5. only active students assigned to that trip route in the same tenant are
--        returned
--     6. stop names are returned only when the stop is active, same tenant, and
--        same route

create or replace function public.get_driver_active_trip_student_manifest()
returns table (
  active_trip_id uuid,
  student_id uuid,
  student_display_name text,
  route_name text,
  trip_status text,
  trip_direction text,
  pickup_stop_name text,
  dropoff_stop_name text,
  assignment_status text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with active_trip as (
    select
      dt.id,
      dt.tenant_id,
      dt.driver_id,
      dt.route_id,
      dt.bus_id,
      dt.status,
      dt.trip_type,
      dt.started_at
    from public.driver_trips dt
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = dt.tenant_id
      and d.status = 'active'
    join public.buses b
      on b.id = dt.bus_id
      and b.tenant_id = dt.tenant_id
      and b.status = 'active'
    where auth.uid() is not null
      and public.current_user_role() = 'driver'
      and public.current_tenant_id() is not null
      and public.current_driver_id() is not null
      and dt.tenant_id = public.current_tenant_id()
      and dt.driver_id = public.current_driver_id()
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  )
  select
    at.id as active_trip_id,
    s.id as student_id,
    case
      when s.id is null then null
      else s.first_name || ' ' || s.last_name
    end as student_display_name,
    r.route_name,
    at.status as trip_status,
    at.trip_type as trip_direction,
    ps.stop_name as pickup_stop_name,
    ds.stop_name as dropoff_stop_name,
    sra.status as assignment_status
  from active_trip at
  join public.routes r
    on r.id = at.route_id
    and r.tenant_id = at.tenant_id
    and r.status = 'active'
  left join public.student_route_assignments sra
    on sra.route_id = at.route_id
    and sra.tenant_id = at.tenant_id
    and sra.status = 'active'
  left join public.students s
    on s.id = sra.student_id
    and s.tenant_id = at.tenant_id
    and s.status = 'active'
  left join public.route_stops ps
    on ps.id = sra.pickup_stop_id
    and ps.tenant_id = at.tenant_id
    and ps.route_id = at.route_id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = sra.dropoff_stop_id
    and ds.tenant_id = at.tenant_id
    and ds.route_id = at.route_id
    and ds.status = 'active'
  order by s.last_name nulls last, s.first_name nulls last, r.route_name;
$$;

comment on function public.get_driver_active_trip_student_manifest() is
  'Driver-only active trip student manifest. Returns safe trip context and '
  'active same-tenant students assigned to the authenticated driver''s active '
  'trip route. Returns one trip-context row with null student fields when the '
  'driver has an active trip but no active student assignments. SECURITY '
  'DEFINER; internal driver/tenant/ownership checks are the primary boundary.';

revoke all on function public.get_driver_active_trip_student_manifest() from public;
revoke all on function public.get_driver_active_trip_student_manifest() from anon;
grant execute on function public.get_driver_active_trip_student_manifest() to authenticated;
