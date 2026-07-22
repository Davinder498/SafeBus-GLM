-- Bus-first driver tracking with route context retained for administrators.

create or replace function public.start_driver_trip_from_bus(p_bus_id uuid)
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
  v_candidate_count integer;
  v_assignment_id uuid;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can start a trip.' using errcode = '42501';
  end if;
  if v_driver_id is null or v_tenant_id is null then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  -- Serialize starts for this bus, then resolve exactly one current assignment.
  perform 1 from public.buses b
  where b.id = p_bus_id and b.tenant_id = v_tenant_id and b.status = 'active'
  for update;
  if not found then
    raise exception 'Assigned bus is not active.' using errcode = 'P0002';
  end if;

  select count(*)::integer, min(dra.id::text)::uuid
    into v_candidate_count, v_assignment_id
  from public.driver_route_assignments dra
  join public.routes r on r.id = dra.route_id and r.tenant_id = dra.tenant_id and r.status = 'active'
  join public.route_trip_patterns rtp on rtp.id = dra.route_trip_pattern_id
    and rtp.route_id = dra.route_id and rtp.tenant_id = dra.tenant_id and rtp.status = 'active'
  where dra.tenant_id = v_tenant_id
    and dra.driver_id = v_driver_id
    and dra.bus_id = p_bus_id
    and dra.status = 'active'
    and (dra.effective_from is null or dra.effective_from <= current_date)
    and (dra.effective_to is null or dra.effective_to >= current_date);

  if v_candidate_count = 0 then
    raise exception 'No active assignment exists for this bus today.' using errcode = 'P0002';
  end if;
  if v_candidate_count > 1 then
    raise exception 'This bus has multiple active route assignments today.' using errcode = '55006';
  end if;

  select * into v_assignment from public.driver_route_assignments where id = v_assignment_id for update;
  select * into v_pattern from public.route_trip_patterns where id = v_assignment.route_trip_pattern_id;

  begin
    insert into public.driver_trips (
      tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id,
      trip_name_snapshot, trip_type, status, service_date, started_at
    ) values (
      v_tenant_id, v_driver_id, p_bus_id, v_assignment.route_id, v_pattern.id,
      v_pattern.display_name,
      case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
      'active', current_date, now()
    ) returning * into v_trip;
  exception when unique_violation then
    raise exception 'The driver or bus already has an active trip.' using errcode = '55006';
  end;

  return v_trip;
end;
$$;

revoke all on function public.start_driver_trip_from_bus(uuid) from public, anon;
grant execute on function public.start_driver_trip_from_bus(uuid) to authenticated;

comment on function public.start_driver_trip_from_bus(uuid) is
  'Driver-only bus-first trip start. Accepts only an assigned bus ID, resolves exactly one current route assignment server-side, and retains route/pattern context for operations.';

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
    raise exception 'Guardian live bus location access requires an active guardian identity.' using errcode = '42501';
  end if;

  return query
  with eligible_students as (
    select distinct s.id as student_id, s.tenant_id
    from public.students s
    join public.student_guardians sg on sg.student_id = s.id
      and sg.tenant_id = s.tenant_id and sg.guardian_id = v_guardian_id and sg.status = 'active'
    where s.tenant_id = v_tenant_id and s.status = 'active'
  ),
  active_trip_candidates as (
    select distinct es.student_id, dt.id as driver_trip_id, dt.tenant_id,
      dt.driver_id, dt.bus_id, dt.route_id, dt.started_at
    from eligible_students es
    join public.student_bus_assignments sba on sba.student_id = es.student_id
      and sba.tenant_id = es.tenant_id and sba.status = 'active'
      and sba.effective_from <= current_date
      and (sba.effective_to is null or sba.effective_to >= current_date)
    join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
      and bra.tenant_id = es.tenant_id and bra.status = 'active'
    join public.driver_trips dt on dt.bus_id = bra.bus_id
      and dt.tenant_id = es.tenant_id and dt.status = 'active'
    join public.buses b on b.id = dt.bus_id and b.tenant_id = es.tenant_id and b.status = 'active'
    join public.drivers d on d.id = dt.driver_id and d.tenant_id = es.tenant_id and d.status = 'active'
  ),
  trip_rollup as (
    select atc.student_id, count(distinct atc.driver_trip_id) as active_trip_count,
      min(atc.driver_trip_id::text)::uuid as only_driver_trip_id
    from active_trip_candidates atc group by atc.student_id
  ),
  selected_trip as (
    select atc.* from active_trip_candidates atc
    join trip_rollup tr on tr.student_id = atc.student_id
      and tr.active_trip_count = 1 and tr.only_driver_trip_id = atc.driver_trip_id
  ),
  located as (
    select tr.student_id, tr.active_trip_count, loc.latitude as raw_latitude,
      loc.longitude as raw_longitude, loc.recorded_at as raw_recorded_at,
      case when loc.recorded_at is null then null::bigint
        else floor(extract(epoch from (now() - loc.recorded_at)))::bigint end as raw_age_seconds
    from trip_rollup tr
    left join selected_trip st on st.student_id = tr.student_id
    left join public.driver_trip_current_locations loc on loc.driver_trip_id = st.driver_trip_id
      and loc.tenant_id = st.tenant_id and loc.driver_id = st.driver_id
      and loc.bus_id = st.bus_id and loc.route_id = st.route_id
  ),
  classified as (
    select l.*,
      case when l.active_trip_count > 1 then 'invalid'
        when l.raw_recorded_at is null then 'missing'
        when l.raw_latitude is null or l.raw_longitude is null
          or l.raw_latitude < -90 or l.raw_latitude > 90
          or l.raw_longitude < -180 or l.raw_longitude > 180
          or l.raw_age_seconds is null or l.raw_age_seconds < 0 or l.raw_recorded_at > now() then 'invalid'
        when l.raw_recorded_at < now() - interval '2 minutes' then 'stale'
        else 'fresh' end as safe_state
    from located l
  )
  select c.student_id, c.safe_state,
    case when c.safe_state = 'fresh' then c.raw_latitude else null::double precision end,
    case when c.safe_state = 'fresh' then c.raw_longitude else null::double precision end,
    case when c.safe_state in ('fresh', 'stale') then c.raw_recorded_at else null::timestamptz end,
    case when c.safe_state in ('fresh', 'stale') then greatest(c.raw_age_seconds, 0::bigint) else null::bigint end
  from classified c order by c.student_id;
end;
$$;

revoke all on function public.get_guardian_student_live_bus_location_state() from public, anon;
grant execute on function public.get_guardian_student_live_bus_location_state() to authenticated;

comment on function public.get_guardian_student_live_bus_location_state() is
  'Guardian-only bus-location RPC. Eligibility follows active guardian-student and student-bus assignments; route, trip, bus, and driver identifiers remain withheld.';
