-- SafeBus Alberta - restore guardian notification outbox enqueueing
--
-- Migration 0054 moved driver event authorization from legacy route-only
-- assignments to exact bus-service and trip-pattern assignments. That function
-- replacement unintentionally omitted the established guardian outbox enqueue
-- from migration 0025. Restore the existing outbox behavior while retaining
-- all current bus-service, stop, role, tenant, ordering, and duplicate checks.

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
  v_stop_id uuid;
  v_has_pickup boolean;
  v_has_dropoff boolean;
  v_event_id uuid;
  v_notification_type text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can record student trip events.' using errcode = '42501';
  end if;
  if p_student_id is null or p_event_type not in ('picked_up', 'dropped_off') then
    raise exception 'Invalid student trip event.' using errcode = '22023';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.tenant_id = public.current_tenant_id()
    and dt.driver_id = public.current_driver_id()
    and dt.status = 'active'
  order by dt.started_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;

  select
    case when p_event_type = 'picked_up' then sba.pickup_stop_id else sba.dropoff_stop_id end
  into v_stop_id
  from public.student_bus_assignments sba
  join public.bus_route_assignments bra
    on bra.id = sba.bus_route_assignment_id
    and bra.tenant_id = v_trip.tenant_id
    and bra.bus_id = v_trip.bus_id
    and bra.route_id = v_trip.route_id
    and bra.route_trip_pattern_id = v_trip.route_trip_pattern_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= v_trip.service_date)
    and (bra.effective_to is null or bra.effective_to >= v_trip.service_date)
  where sba.student_id = p_student_id
    and sba.tenant_id = v_trip.tenant_id
    and sba.route_trip_pattern_id = v_trip.route_trip_pattern_id
    and sba.status = 'active'
    and sba.effective_from <= v_trip.service_date
    and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  order by sba.effective_from desc
  limit 1;

  if not found then
    raise exception 'Student is not assigned to this active trip.' using errcode = 'P0002';
  end if;
  if v_stop_id is null then
    raise exception 'The planned stop must be assigned before recording this event.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.route_stops rs
    where rs.id = v_stop_id
      and rs.tenant_id = v_trip.tenant_id
      and rs.route_id = v_trip.route_id
      and rs.status = 'active'
  ) then
    raise exception 'The planned stop is not available on this route.' using errcode = '23514';
  end if;

  select
    exists (
      select 1 from public.student_trip_events
      where driver_trip_id = v_trip.id
        and student_id = p_student_id
        and event_type = 'picked_up'
    ),
    exists (
      select 1 from public.student_trip_events
      where driver_trip_id = v_trip.id
        and student_id = p_student_id
        and event_type = 'dropped_off'
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
    route_stop_id,
    event_type,
    created_by
  ) values (
    v_trip.tenant_id,
    v_trip.id,
    p_student_id,
    v_stop_id,
    p_event_type,
    auth.uid()
  )
  returning id into v_event_id;

  v_notification_type := case p_event_type
    when 'picked_up' then 'student_picked_up'
    when 'dropped_off' then 'student_dropped_off'
  end;

  insert into public.guardian_notification_outbox (
    tenant_id,
    guardian_id,
    student_id,
    student_trip_event_id,
    notification_type
  )
  select
    v_trip.tenant_id,
    sg.guardian_id,
    p_student_id,
    v_event_id,
    v_notification_type
  from public.student_guardians sg
  join public.guardians g
    on g.id = sg.guardian_id
    and g.tenant_id = sg.tenant_id
    and g.status = 'active'
  where sg.tenant_id = v_trip.tenant_id
    and sg.student_id = p_student_id
    and sg.status = 'active'
    and sg.can_receive_notifications = true
  on conflict (tenant_id, guardian_id, student_trip_event_id, notification_type)
  do nothing;
exception
  when unique_violation then
    raise exception 'Student trip event already recorded.' using errcode = '23505';
end;
$$;

revoke all on function public.record_student_trip_event_for_active_trip(uuid, text)
  from public, anon, authenticated;

comment on function public.record_student_trip_event_for_active_trip(uuid, text) is
  'Internal driver event recorder restricted to students on the exact active bus service and trip pattern. Records the planned stop and enqueues existing guardian notification outbox rows for active, notification-authorized links.';
