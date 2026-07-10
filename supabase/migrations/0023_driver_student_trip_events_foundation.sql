-- SafeBus Alberta - driver student trip event recording foundation
--
-- Milestone 7B: secure driver-only pickup/drop-off event recording for
-- students assigned to the authenticated driver's current active trip.
--
-- DELIBERATELY EXCLUDED:
--   - no QR codes, camera access, guardian notifications, maps, GPS,
--     coordinates, ETA, speed, guardian timelines, realtime subscriptions,
--     or admin workflow changes.
--
-- SECURITY MODEL:
--   Browser writes are RPC-only. The student_trip_events table has RLS enabled
--   and receives no direct browser grants or broad policies. SECURITY DEFINER
--   functions perform all tenant, role, active-trip, driver ownership, student,
--   assignment, and event-order checks before inserting.

create table public.student_trip_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  event_type text not null,
  event_time timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint student_trip_events_event_type_check check (
    event_type in ('picked_up', 'dropped_off')
  )
);

create index student_trip_events_tenant_id_idx
  on public.student_trip_events(tenant_id);
create index student_trip_events_driver_trip_id_idx
  on public.student_trip_events(driver_trip_id);
create index student_trip_events_student_id_idx
  on public.student_trip_events(student_id);
create index student_trip_events_event_type_idx
  on public.student_trip_events(event_type);
create index student_trip_events_event_time_idx
  on public.student_trip_events(event_time);

create unique index student_trip_events_trip_student_type_unique
  on public.student_trip_events(driver_trip_id, student_id, event_type);

alter table public.student_trip_events enable row level security;

revoke all on table public.student_trip_events from anon;
revoke all on table public.student_trip_events from authenticated;

create or replace function public.record_student_trip_event_for_active_trip(
  p_student_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.driver_trips;
  v_has_pickup boolean;
  v_has_dropoff boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can record student trip events.' using errcode = '42501';
  end if;

  if public.current_tenant_id() is null or public.current_driver_id() is null then
    raise exception 'Driver profile not found.' using errcode = '42501';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.' using errcode = '22004';
  end if;

  if p_event_type not in ('picked_up', 'dropped_off') then
    raise exception 'Invalid student trip event.' using errcode = '22023';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  join public.drivers d
    on d.id = dt.driver_id
    and d.tenant_id = dt.tenant_id
    and d.status = 'active'
  join public.buses b
    on b.id = dt.bus_id
    and b.tenant_id = dt.tenant_id
    and b.status = 'active'
  join public.routes r
    on r.id = dt.route_id
    and r.tenant_id = dt.tenant_id
    and r.status = 'active'
  where dt.tenant_id = public.current_tenant_id()
    and dt.driver_id = public.current_driver_id()
    and dt.status = 'active'
  order by dt.started_at desc
  limit 1
  for update of dt;

  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.students s
    join public.student_route_assignments sra
      on sra.student_id = s.id
      and sra.tenant_id = s.tenant_id
      and sra.route_id = v_trip.route_id
      and sra.status = 'active'
    where s.id = p_student_id
      and s.tenant_id = v_trip.tenant_id
      and s.status = 'active'
  ) then
    raise exception 'Student not found for active trip.' using errcode = 'P0002';
  end if;

  select exists (
           select 1
           from public.student_trip_events e
           where e.driver_trip_id = v_trip.id
             and e.student_id = p_student_id
             and e.event_type = 'picked_up'
         ),
         exists (
           select 1
           from public.student_trip_events e
           where e.driver_trip_id = v_trip.id
             and e.student_id = p_student_id
             and e.event_type = 'dropped_off'
         )
  into v_has_pickup, v_has_dropoff;

  if v_has_dropoff then
    raise exception 'Student trip is already complete.' using errcode = '23505';
  end if;

  if p_event_type = 'picked_up' and v_has_pickup then
    raise exception 'Student is already picked up.' using errcode = '23505';
  end if;

  if p_event_type = 'dropped_off' and not v_has_pickup then
    raise exception 'Student must be picked up first.' using errcode = '23514';
  end if;

  insert into public.student_trip_events (
    tenant_id,
    driver_trip_id,
    student_id,
    event_type,
    created_by
  )
  values (
    v_trip.tenant_id,
    v_trip.id,
    p_student_id,
    p_event_type,
    auth.uid()
  );
exception
  when unique_violation then
    raise exception 'Student trip event already recorded.' using errcode = '23505';
end;
$$;

comment on function public.record_student_trip_event_for_active_trip(uuid, text) is
  'Internal driver-only student trip event recorder for the authenticated '
  'driver''s active trip. Enforces role, tenant, driver ownership, active trip, '
  'active student route assignment, and pickup/drop-off ordering.';

revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from public;
revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from anon;
revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from authenticated;

create or replace function public.mark_student_picked_up_for_active_trip(
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_student_trip_event_for_active_trip(p_student_id, 'picked_up');
end;
$$;

create or replace function public.mark_student_dropped_off_for_active_trip(
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_student_trip_event_for_active_trip(p_student_id, 'dropped_off');
end;
$$;

comment on function public.mark_student_picked_up_for_active_trip(uuid) is
  'Driver-only RPC to mark an active-trip assigned student as picked up.';

comment on function public.mark_student_dropped_off_for_active_trip(uuid) is
  'Driver-only RPC to mark an active-trip assigned student as dropped off.';

revoke all on function public.mark_student_picked_up_for_active_trip(uuid) from public;
revoke all on function public.mark_student_picked_up_for_active_trip(uuid) from anon;
grant execute on function public.mark_student_picked_up_for_active_trip(uuid) to authenticated;

revoke all on function public.mark_student_dropped_off_for_active_trip(uuid) from public;
revoke all on function public.mark_student_dropped_off_for_active_trip(uuid) from anon;
grant execute on function public.mark_student_dropped_off_for_active_trip(uuid) to authenticated;

drop function public.get_driver_active_trip_student_manifest();

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
  assignment_status text,
  pickup_event_time timestamptz,
  dropoff_event_time timestamptz,
  student_trip_status text
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
  ),
  event_state as (
    select
      e.driver_trip_id,
      e.student_id,
      max(e.event_time) filter (where e.event_type = 'picked_up') as pickup_event_time,
      max(e.event_time) filter (where e.event_type = 'dropped_off') as dropoff_event_time
    from public.student_trip_events e
    join active_trip at
      on at.id = e.driver_trip_id
      and at.tenant_id = e.tenant_id
    group by e.driver_trip_id, e.student_id
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
    sra.status as assignment_status,
    es.pickup_event_time,
    es.dropoff_event_time,
    case
      when s.id is null then null
      when es.dropoff_event_time is not null then 'dropped_off'
      when es.pickup_event_time is not null then 'picked_up'
      else 'not_picked_up'
    end as student_trip_status
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
  left join event_state es
    on es.driver_trip_id = at.id
    and es.student_id = s.id
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
  'Driver-only active trip student manifest. Returns safe trip context, active '
  'same-tenant students assigned to the authenticated driver''s active trip '
  'route, and pickup/drop-off event state. SECURITY DEFINER; internal driver, '
  'tenant, ownership, assignment, and event-state checks are the primary '
  'boundary.';

revoke all on function public.get_driver_active_trip_student_manifest() from public;
revoke all on function public.get_driver_active_trip_student_manifest() from anon;
grant execute on function public.get_driver_active_trip_student_manifest() to authenticated;
