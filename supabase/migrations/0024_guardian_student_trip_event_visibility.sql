-- SafeBus Alberta - guardian student trip event visibility foundation
--
-- Milestone 8A: secure guardian-only read path for pickup/drop-off status.
--
-- This migration is additive. It creates one SECURITY DEFINER RPC:
--   public.get_guardian_student_trip_event_visibility()
--
-- No table grants or broad RLS policies are added for student_trip_events.
-- Guardians read pickup/drop-off status only through this narrow RPC.

create or replace function public.get_guardian_student_trip_event_visibility()
returns table (
  student_id uuid,
  student_display_name text,
  route_name text,
  trip_status text,
  trip_direction text,
  pickup_stop_name text,
  dropoff_stop_name text,
  student_trip_status text,
  pickup_event_time timestamptz,
  dropoff_event_time timestamptz,
  last_event_time timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.id as student_id,
    s.first_name || ' ' || s.last_name as student_display_name,
    r.route_name,
    t.status as trip_status,
    t.trip_type as trip_direction,
    ps.stop_name as pickup_stop_name,
    ds.stop_name as dropoff_stop_name,
    case
      when t.id is null then 'no_active_trip'
      when es.dropoff_event_time is not null then 'dropped_off'
      when es.pickup_event_time is not null then 'picked_up'
      else 'not_picked_up'
    end as student_trip_status,
    es.pickup_event_time,
    es.dropoff_event_time,
    greatest(es.pickup_event_time, es.dropoff_event_time) as last_event_time
  from public.students s
  join public.student_guardians sg
    on sg.student_id = s.id
    and sg.guardian_id = public.current_guardian_id()
    and sg.tenant_id = s.tenant_id
    and sg.status = 'active'
  join public.student_route_assignments sra
    on sra.student_id = s.id
    and sra.tenant_id = s.tenant_id
    and sra.status = 'active'
  join public.routes r
    on r.id = sra.route_id
    and r.tenant_id = s.tenant_id
    and r.status = 'active'
  left join public.route_stops ps
    on ps.id = sra.pickup_stop_id
    and ps.tenant_id = s.tenant_id
    and ps.route_id = r.id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = sra.dropoff_stop_id
    and ds.tenant_id = s.tenant_id
    and ds.route_id = r.id
    and ds.status = 'active'
  left join lateral (
    select dt.id, dt.status, dt.trip_type, dt.started_at
    from public.driver_trips dt
    join public.buses b
      on b.id = dt.bus_id
      and b.tenant_id = s.tenant_id
      and b.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = s.tenant_id
      and d.status = 'active'
    where dt.route_id = r.id
      and dt.tenant_id = s.tenant_id
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ) t on true
  left join lateral (
    select
      max(e.event_time) filter (where e.event_type = 'picked_up') as pickup_event_time,
      max(e.event_time) filter (where e.event_type = 'dropped_off') as dropoff_event_time
    from public.student_trip_events e
    where e.driver_trip_id = t.id
      and e.student_id = s.id
      and e.tenant_id = s.tenant_id
  ) es on t.id is not null
  where auth.uid() is not null
    and public.current_user_role() = 'guardian'
    and public.current_guardian_id() is not null
    and public.current_tenant_id() is not null
    and s.tenant_id = public.current_tenant_id()
    and s.status = 'active'
  order by s.last_name, s.first_name, r.route_name;
$$;

comment on function public.get_guardian_student_trip_event_visibility() is
  'Guardian-scoped pickup/drop-off status for actively linked students. '
  'Returns safe display fields and derived status for each linked active '
  'student route assignment. Uses only the latest active same-tenant route trip '
  'and matching student_trip_events. Excludes event ids, trip ids, driver ids, '
  'bus ids, tenant ids, guardian ids, contact fields, GPS, speed, ETA, QR, and '
  'audit details. SECURITY DEFINER; explicit auth, role, guardian, tenant, '
  'link, assignment, and same-tenant checks are the enforcement boundary.';

revoke all on function public.get_guardian_student_trip_event_visibility() from public;
revoke all on function public.get_guardian_student_trip_event_visibility() from anon;
grant execute on function public.get_guardian_student_trip_event_visibility() to authenticated;
