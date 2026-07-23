-- SafeBus Alberta - assignment-selected driver trips
--
-- A bus can serve several named route trips and a driver can be assigned to
-- several of them. The assignment id is the unambiguous, server-validated
-- trip-start input. All downstream student and guardian access follows the
-- selected trip pattern rather than matching only a bus or route.

alter table public.driver_trips
  add column driver_route_assignment_id uuid
    references public.driver_route_assignments(id) on delete set null;

create index driver_trips_driver_route_assignment_idx
  on public.driver_trips(driver_route_assignment_id);

comment on column public.driver_trips.driver_route_assignment_id is
  'The exact driver assignment selected to start this trip. Null only for trip history created before migration 0054.';

create or replace function public.get_current_driver_trip_assignments()
returns table (
  assignment_id uuid,
  bus_id uuid,
  route_id uuid,
  route_trip_pattern_id uuid,
  trip_name text,
  direction text,
  route_name text,
  route_code text,
  bus_number text,
  scheduled_start_time time without time zone
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver_id uuid := public.current_driver_id();
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can view trip assignments.' using errcode = '42501';
  end if;
  if v_driver_id is null or v_tenant_id is null then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  return query
  select
    dra.id,
    dra.bus_id,
    dra.route_id,
    dra.route_trip_pattern_id,
    rtp.display_name,
    rtp.direction,
    r.route_name,
    r.route_code,
    b.bus_number,
    first_stop.planned_arrival_time
  from public.driver_route_assignments dra
  join public.drivers d
    on d.id = dra.driver_id
    and d.tenant_id = dra.tenant_id
    and d.status = 'active'
  join public.buses b
    on b.id = dra.bus_id
    and b.tenant_id = dra.tenant_id
    and b.status = 'active'
  join public.routes r
    on r.id = dra.route_id
    and r.tenant_id = dra.tenant_id
    and r.status = 'active'
    and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = dra.route_trip_pattern_id
    and rtp.route_id = dra.route_id
    and rtp.tenant_id = dra.tenant_id
    and rtp.status = 'active'
    and not rtp.schedule_review_required
  join public.bus_route_assignments bra
    on bra.id = dra.bus_route_assignment_id
    and bra.tenant_id = dra.tenant_id
    and bra.bus_id = dra.bus_id
    and bra.route_id = dra.route_id
    and bra.route_trip_pattern_id = dra.route_trip_pattern_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= current_date)
    and (bra.effective_to is null or bra.effective_to >= current_date)
  left join lateral (
    select rtss.planned_arrival_time
    from public.route_trip_stop_schedules rtss
    join public.route_stops rs
      on rs.id = rtss.route_stop_id
      and rs.route_id = dra.route_id
      and rs.tenant_id = dra.tenant_id
      and rs.status = 'active'
    where rtss.route_trip_pattern_id = dra.route_trip_pattern_id
      and rtss.route_id = dra.route_id
      and rtss.tenant_id = dra.tenant_id
    order by
      case when rtp.direction = 'forward' then rs.stop_order end asc nulls last,
      case when rtp.direction = 'reverse' then rs.stop_order end desc nulls last
    limit 1
  ) first_stop on true
  where dra.tenant_id = v_tenant_id
    and dra.driver_id = v_driver_id
    and dra.status = 'active'
    and (dra.effective_from is null or dra.effective_from <= current_date)
    and (dra.effective_to is null or dra.effective_to >= current_date)
  order by
    first_stop.planned_arrival_time nulls last,
    lower(rtp.display_name),
    b.bus_number,
    dra.id;
end;
$$;

revoke all on function public.get_current_driver_trip_assignments() from public, anon;
grant execute on function public.get_current_driver_trip_assignments() to authenticated;

comment on function public.get_current_driver_trip_assignments() is
  'Driver-only list of currently effective, startable assignments. Returns exact assignment identity and safe operational labels.';

create or replace function public.start_driver_trip_from_assignment(p_assignment_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver_id uuid := public.current_driver_id();
  v_tenant_id uuid := public.current_tenant_id();
  v_assignment public.driver_route_assignments;
  v_pattern public.route_trip_patterns;
  v_trip public.driver_trips;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can start a trip.' using errcode = '42501';
  end if;
  if v_driver_id is null or v_tenant_id is null then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  -- Serialize all starts for this driver before checking active-trip state.
  perform 1
  from public.drivers d
  where d.id = v_driver_id
    and d.tenant_id = v_tenant_id
    and d.status = 'active'
  for update;
  if not found then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.driver_trips dt
    where dt.driver_id = v_driver_id
      and dt.tenant_id = v_tenant_id
      and dt.status = 'active'
  ) then
    raise exception 'You already have an active trip. End it before starting another.'
      using errcode = '55006';
  end if;

  select dra.* into v_assignment
  from public.driver_route_assignments dra
  where dra.id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_assignment.tenant_id <> v_tenant_id
    or v_assignment.driver_id <> v_driver_id then
    raise exception 'This assignment does not belong to the current driver.'
      using errcode = '42501';
  end if;
  if v_assignment.status <> 'active'
    or (v_assignment.effective_from is not null and v_assignment.effective_from > current_date)
    or (v_assignment.effective_to is not null and v_assignment.effective_to < current_date) then
    raise exception 'This assignment is not active today.' using errcode = '55006';
  end if;

  -- Serialize starts for the selected bus and return a distinct in-use error.
  perform 1
  from public.buses b
  where b.id = v_assignment.bus_id
    and b.tenant_id = v_tenant_id
    and b.status = 'active'
  for update;
  if not found then
    raise exception 'The assigned bus is not active.' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.driver_trips dt
    where dt.bus_id = v_assignment.bus_id
      and dt.tenant_id = v_tenant_id
      and dt.status = 'active'
  ) then
    raise exception 'This bus already has an active trip. Choose another assignment or contact your transportation admin.'
      using errcode = '55006';
  end if;

  select rtp.* into v_pattern
  from public.bus_route_assignments bra
  join public.routes r
    on r.id = bra.route_id
    and r.tenant_id = bra.tenant_id
    and r.status = 'active'
    and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
    and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id
    and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = v_assignment.bus_route_assignment_id
    and bra.tenant_id = v_assignment.tenant_id
    and bra.bus_id = v_assignment.bus_id
    and bra.route_id = v_assignment.route_id
    and bra.route_trip_pattern_id = v_assignment.route_trip_pattern_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= current_date)
    and (bra.effective_to is null or bra.effective_to >= current_date);

  if not found then
    raise exception 'This assignment does not have an active bus service and trip pattern today.'
      using errcode = '55006';
  end if;

  begin
    insert into public.driver_trips (
      tenant_id,
      driver_id,
      bus_id,
      route_id,
      route_trip_pattern_id,
      driver_route_assignment_id,
      trip_name_snapshot,
      trip_type,
      status,
      service_date,
      started_at
    ) values (
      v_assignment.tenant_id,
      v_assignment.driver_id,
      v_assignment.bus_id,
      v_assignment.route_id,
      v_pattern.id,
      v_assignment.id,
      v_pattern.display_name,
      case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
      'active',
      current_date,
      now()
    )
    returning * into v_trip;
  exception
    when unique_violation then
      raise exception 'A driver or bus active trip was created concurrently. Refresh and try again.'
        using errcode = '55006';
  end;

  return v_trip;
end;
$$;

revoke all on function public.start_driver_trip_from_assignment(uuid) from public, anon;
grant execute on function public.start_driver_trip_from_assignment(uuid) to authenticated;

comment on function public.start_driver_trip_from_assignment(uuid) is
  'Driver-only assignment-selected trip start. Validates exact driver, tenant, bus service, route, pattern, dates, and active-trip invariants before deriving the trip server-side.';

comment on function public.start_driver_trip_from_bus(uuid) is
  'Deprecated compatibility entrypoint. New clients must select and start an exact driver assignment with start_driver_trip_from_assignment(uuid).';

drop function public.get_driver_active_trip_student_manifest();

create function public.get_driver_active_trip_student_manifest()
returns table (
  active_trip_id uuid,
  student_id uuid,
  student_display_name text,
  route_name text,
  trip_name text,
  bus_number text,
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
      dt.bus_id,
      dt.route_id,
      dt.route_trip_pattern_id,
      dt.trip_name_snapshot,
      dt.status,
      dt.service_date,
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
      and dt.tenant_id = public.current_tenant_id()
      and dt.driver_id = public.current_driver_id()
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ),
  eligible_assignments as (
    select
      at.id as active_trip_id,
      sba.student_id,
      sba.pickup_stop_id,
      sba.dropoff_stop_id,
      sba.status as assignment_status
    from active_trip at
    join public.student_bus_assignments sba
      on sba.tenant_id = at.tenant_id
      and sba.route_trip_pattern_id = at.route_trip_pattern_id
      and sba.status = 'active'
      and sba.effective_from <= at.service_date
      and (sba.effective_to is null or sba.effective_to >= at.service_date)
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id
      and bra.tenant_id = at.tenant_id
      and bra.bus_id = at.bus_id
      and bra.route_id = at.route_id
      and bra.route_trip_pattern_id = at.route_trip_pattern_id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= at.service_date)
      and (bra.effective_to is null or bra.effective_to >= at.service_date)
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
    at.id,
    s.id,
    case when s.id is null then null else concat_ws(' ', s.first_name, s.last_name) end,
    r.route_name,
    at.trip_name_snapshot,
    b.bus_number,
    at.status,
    rtp.direction,
    ps.stop_name,
    ds.stop_name,
    ea.assignment_status,
    es.pickup_event_time,
    es.dropoff_event_time,
    case
      when s.id is null then null
      when es.dropoff_event_time is not null then 'dropped_off'
      when es.pickup_event_time is not null then 'picked_up'
      else 'not_picked_up'
    end
  from active_trip at
  join public.routes r
    on r.id = at.route_id
    and r.tenant_id = at.tenant_id
    and r.status = 'active'
  join public.buses b
    on b.id = at.bus_id
    and b.tenant_id = at.tenant_id
    and b.status = 'active'
  join public.route_trip_patterns rtp
    on rtp.id = at.route_trip_pattern_id
    and rtp.route_id = at.route_id
    and rtp.tenant_id = at.tenant_id
  left join eligible_assignments ea on ea.active_trip_id = at.id
  left join public.students s
    on s.id = ea.student_id
    and s.tenant_id = at.tenant_id
    and s.status = 'active'
  left join event_state es
    on es.driver_trip_id = at.id
    and es.student_id = s.id
  left join public.route_stops ps
    on ps.id = ea.pickup_stop_id
    and ps.tenant_id = at.tenant_id
    and ps.route_id = at.route_id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = ea.dropoff_stop_id
    and ds.tenant_id = at.tenant_id
    and ds.route_id = at.route_id
    and ds.status = 'active'
  order by s.last_name nulls last, s.first_name nulls last, r.route_name;
$$;

revoke all on function public.get_driver_active_trip_student_manifest() from public, anon;
grant execute on function public.get_driver_active_trip_student_manifest() to authenticated;

comment on function public.get_driver_active_trip_student_manifest() is
  'Driver-only pickup/drop-off list scoped to the exact active bus service and trip pattern.';

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
  );
exception
  when unique_violation then
    raise exception 'Student trip event already recorded.' using errcode = '23505';
end;
$$;

revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from public, anon;

comment on function public.record_student_trip_event_for_active_trip(uuid, text) is
  'Internal driver event recorder restricted to students on the exact active bus service and trip pattern.';

create or replace function public.resolve_student_qr_for_active_trip(p_qr_token text)
returns table (
  student_id uuid,
  student_display_name text,
  pickup_stop_name text,
  dropoff_stop_name text,
  student_trip_status text,
  next_event_type text,
  message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.driver_trips;
  v_hash text;
  v_student public.students;
  v_pick timestamptz;
  v_drop timestamptz;
  v_pick_stop text;
  v_drop_stop text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Invalid badge.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_qr_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Invalid badge.' using errcode = '22023';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.tenant_id = public.current_tenant_id()
    and dt.driver_id = public.current_driver_id()
    and dt.status = 'active'
  order by dt.started_at desc
  limit 1;
  if not found then
    raise exception 'Active trip required.' using errcode = 'P0002';
  end if;

  v_hash := public.hash_student_qr_token(p_qr_token);
  select s.* into v_student
  from public.student_qr_credentials c
  join public.students s
    on s.id = c.student_id
    and s.tenant_id = c.tenant_id
    and s.status = 'active'
  where c.token_hash = v_hash
    and c.status = 'active'
    and c.tenant_id = v_trip.tenant_id;
  if not found then
    raise exception 'Invalid badge.' using errcode = 'P0002';
  end if;

  select ps.stop_name, ds.stop_name
  into v_pick_stop, v_drop_stop
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
  left join public.route_stops ps
    on ps.id = sba.pickup_stop_id
    and ps.tenant_id = v_trip.tenant_id
    and ps.route_id = v_trip.route_id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = sba.dropoff_stop_id
    and ds.tenant_id = v_trip.tenant_id
    and ds.route_id = v_trip.route_id
    and ds.status = 'active'
  where sba.student_id = v_student.id
    and sba.tenant_id = v_trip.tenant_id
    and sba.route_trip_pattern_id = v_trip.route_trip_pattern_id
    and sba.status = 'active'
    and sba.effective_from <= v_trip.service_date
    and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  order by sba.effective_from desc
  limit 1;
  if not found then
    raise exception 'Invalid badge.' using errcode = 'P0002';
  end if;

  select
    max(event_time) filter (where event_type = 'picked_up'),
    max(event_time) filter (where event_type = 'dropped_off')
  into v_pick, v_drop
  from public.student_trip_events
  where driver_trip_id = v_trip.id
    and student_id = v_student.id
    and tenant_id = v_trip.tenant_id;

  return query
  select
    v_student.id,
    concat_ws(' ', v_student.first_name, v_student.last_name),
    v_pick_stop,
    v_drop_stop,
    case
      when v_drop is not null then 'dropped_off'
      when v_pick is not null then 'picked_up'
      else 'not_picked_up'
    end,
    case
      when v_drop is not null then null
      when v_pick is not null then 'dropped_off'
      else 'picked_up'
    end,
    case
      when v_drop is not null then 'Student trip events are complete.'
      when v_pick is not null then 'Ready to confirm drop-off.'
      else 'Ready to confirm pickup.'
    end;
end;
$$;

revoke all on function public.resolve_student_qr_for_active_trip(text) from public, anon;
grant execute on function public.resolve_student_qr_for_active_trip(text) to authenticated;

comment on function public.resolve_student_qr_for_active_trip(text) is
  'Driver-only QR resolution restricted to the exact active bus service and trip pattern; invalid or sibling-trip badges fail closed.';

create or replace function public.get_guardian_student_live_bus_location_state()
returns table (
  student_id uuid,
  location_state text,
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  location_age_seconds bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Guardian live bus location access requires authentication.' using errcode = '42501';
  end if;
  if public.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian live bus location access requires an active guardian role.' using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  v_guardian_id := public.current_guardian_id();
  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian live bus location access requires an active guardian identity.'
      using errcode = '42501';
  end if;

  return query
  with eligible_students as (
    select distinct s.id as student_id, s.tenant_id
    from public.students s
    join public.student_guardians sg
      on sg.student_id = s.id
      and sg.tenant_id = s.tenant_id
      and sg.guardian_id = v_guardian_id
      and sg.status = 'active'
    where s.tenant_id = v_tenant_id
      and s.status = 'active'
  ),
  active_trip_candidates as (
    select distinct
      es.student_id,
      dt.id as driver_trip_id,
      dt.tenant_id,
      dt.driver_id,
      dt.bus_id,
      dt.route_id,
      dt.route_trip_pattern_id,
      dt.started_at
    from eligible_students es
    join public.student_bus_assignments sba
      on sba.student_id = es.student_id
      and sba.tenant_id = es.tenant_id
      and sba.status = 'active'
      and sba.effective_from <= current_date
      and (sba.effective_to is null or sba.effective_to >= current_date)
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id
      and bra.tenant_id = es.tenant_id
      and bra.route_trip_pattern_id = sba.route_trip_pattern_id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= current_date)
      and (bra.effective_to is null or bra.effective_to >= current_date)
    join public.driver_trips dt
      on dt.bus_id = bra.bus_id
      and dt.route_id = bra.route_id
      and dt.route_trip_pattern_id = bra.route_trip_pattern_id
      and dt.tenant_id = es.tenant_id
      and dt.status = 'active'
    join public.buses b
      on b.id = dt.bus_id
      and b.tenant_id = es.tenant_id
      and b.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = es.tenant_id
      and d.status = 'active'
  ),
  trip_rollup as (
    select
      atc.student_id,
      count(distinct atc.driver_trip_id) as active_trip_count,
      min(atc.driver_trip_id::text)::uuid as only_driver_trip_id
    from active_trip_candidates atc
    group by atc.student_id
  ),
  selected_trip as (
    select atc.*
    from active_trip_candidates atc
    join trip_rollup tr
      on tr.student_id = atc.student_id
      and tr.active_trip_count = 1
      and tr.only_driver_trip_id = atc.driver_trip_id
  ),
  located as (
    select
      tr.student_id,
      tr.active_trip_count,
      loc.latitude as raw_latitude,
      loc.longitude as raw_longitude,
      loc.recorded_at as raw_recorded_at,
      case
        when loc.recorded_at is null then null::bigint
        else floor(extract(epoch from (now() - loc.recorded_at)))::bigint
      end as raw_age_seconds
    from trip_rollup tr
    left join selected_trip st on st.student_id = tr.student_id
    left join public.driver_trip_current_locations loc
      on loc.driver_trip_id = st.driver_trip_id
      and loc.tenant_id = st.tenant_id
      and loc.driver_id = st.driver_id
      and loc.bus_id = st.bus_id
      and loc.route_id = st.route_id
  ),
  classified as (
    select
      l.*,
      case
        when l.active_trip_count > 1 then 'invalid'
        when l.raw_recorded_at is null then 'missing'
        when l.raw_latitude is null
          or l.raw_longitude is null
          or l.raw_latitude < -90
          or l.raw_latitude > 90
          or l.raw_longitude < -180
          or l.raw_longitude > 180
          or l.raw_age_seconds is null
          or l.raw_age_seconds < 0
          or l.raw_recorded_at > now() then 'invalid'
        when l.raw_recorded_at < now() - interval '2 minutes' then 'stale'
        else 'fresh'
      end as safe_state
    from located l
  )
  select
    c.student_id,
    c.safe_state,
    case when c.safe_state = 'fresh' then c.raw_latitude else null::double precision end,
    case when c.safe_state = 'fresh' then c.raw_longitude else null::double precision end,
    case when c.safe_state in ('fresh', 'stale') then c.raw_recorded_at else null::timestamptz end,
    case when c.safe_state in ('fresh', 'stale') then greatest(c.raw_age_seconds, 0::bigint) else null::bigint end
  from classified c
  order by c.student_id;
end;
$$;

revoke all on function public.get_guardian_student_live_bus_location_state() from public, anon;
grant execute on function public.get_guardian_student_live_bus_location_state() to authenticated;

comment on function public.get_guardian_student_live_bus_location_state() is
  'Guardian-only current bus location state matched through the linked student exact active bus service and trip pattern.';

create or replace function public.get_guardian_live_trip_visibility()
returns table (
  student_id uuid,
  student_name text,
  route_id uuid,
  route_name text,
  pickup_stop_name text,
  dropoff_stop_name text,
  relevant_stop_name text,
  trip_status text,
  has_active_trip boolean,
  last_location_latitude double precision,
  last_location_longitude double precision,
  last_location_recorded_at timestamptz,
  eta_status text,
  eta_min_minutes integer,
  eta_max_minutes integer,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    concat_ws(' ', s.first_name, s.last_name),
    r.id,
    r.route_name,
    ps.stop_name,
    ds.stop_name,
    case when rtp.direction = 'reverse' then ds.stop_name else ps.stop_name end,
    trip.status,
    trip.id is not null,
    loc.latitude,
    loc.longitude,
    loc.recorded_at,
    case when trip.id is null then 'waiting_for_trip' else eta.eta_status end,
    eta.eta_min_minutes,
    eta.eta_max_minutes,
    case when trip.id is null then 'Waiting for the trip to start' else eta.eta_label end,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.students s
  join public.student_guardians sg
    on sg.student_id = s.id
    and sg.guardian_id = public.current_guardian_id()
    and sg.status = 'active'
    and sg.tenant_id = s.tenant_id
  join public.student_bus_assignments sba
    on sba.student_id = s.id
    and sba.tenant_id = s.tenant_id
    and sba.status = 'active'
    and sba.effective_from <= current_date
    and (sba.effective_to is null or sba.effective_to >= current_date)
  join public.bus_route_assignments bra
    on bra.id = sba.bus_route_assignment_id
    and bra.tenant_id = s.tenant_id
    and bra.route_trip_pattern_id = sba.route_trip_pattern_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= current_date)
    and (bra.effective_to is null or bra.effective_to >= current_date)
  join public.routes r
    on r.id = bra.route_id
    and r.tenant_id = s.tenant_id
    and r.status = 'active'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
    and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id
    and rtp.status = 'active'
  left join public.route_stops ps
    on ps.id = sba.pickup_stop_id
    and ps.tenant_id = s.tenant_id
    and ps.route_id = r.id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = sba.dropoff_stop_id
    and ds.tenant_id = s.tenant_id
    and ds.route_id = r.id
    and ds.status = 'active'
  left join lateral (
    select
      dt.id,
      dt.status,
      dt.started_at,
      dt.bus_id,
      dt.route_id,
      dt.driver_id,
      dt.route_trip_pattern_id
    from public.driver_trips dt
    join public.buses b
      on b.id = dt.bus_id
      and b.tenant_id = s.tenant_id
      and b.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = s.tenant_id
      and d.status = 'active'
    where dt.bus_id = bra.bus_id
      and dt.route_id = bra.route_id
      and dt.route_trip_pattern_id = bra.route_trip_pattern_id
      and dt.tenant_id = s.tenant_id
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ) trip on true
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = trip.id
    and loc.tenant_id = s.tenant_id
    and loc.route_id = trip.route_id
    and loc.bus_id = trip.bus_id
    and loc.driver_id = trip.driver_id
  left join lateral public.calculate_safe_route_eta(
    r.id,
    case when rtp.direction = 'reverse' then sba.dropoff_stop_id else sba.pickup_stop_id end,
    rtp.id,
    loc.latitude,
    loc.longitude,
    loc.speed_mps,
    loc.recorded_at
  ) eta on trip.id is not null
  where s.status = 'active'
    and s.tenant_id = public.current_tenant_id()
    and auth.uid() is not null
    and public.current_user_role() = 'guardian'
    and public.current_guardian_id() is not null
    and public.current_tenant_id() is not null
  order by s.last_name, s.first_name, r.route_name, rtp.display_name;
$$;

revoke all on function public.get_guardian_live_trip_visibility() from public, anon;
grant execute on function public.get_guardian_live_trip_visibility() to authenticated;

comment on function public.get_guardian_live_trip_visibility() is
  'Guardian-scoped live trip and ETA visibility matched to each linked student exact active bus service and trip pattern.';
