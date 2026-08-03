-- SafeBus Alberta - guardian bus-first visibility
--
-- Guardians see the stable bus number, current physical plate, and current
-- location/status only when an exact linked-student bus service is active.
-- Route, trip-pattern, stop, driver, bus UUID, and trip UUID data remain
-- server-side authorization inputs and are never returned to the browser.

create or replace function public.get_guardian_bus_visibility()
returns table (
  student_id uuid,
  student_name text,
  student_grade text,
  assignment_state text,
  bus_number text,
  license_plate text,
  has_active_trip boolean,
  location_state text,
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  location_age_seconds bigint,
  eta_status text,
  eta_label text,
  student_trip_status text,
  pickup_event_time timestamptz,
  dropoff_event_time timestamptz,
  last_event_time timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian bus visibility requires an active guardian login.'
      using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  v_guardian_id := public.current_guardian_id();
  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian bus visibility requires an active guardian identity.'
      using errcode = '42501';
  end if;

  return query
  with eligible_students as (
    select distinct
      s.id,
      s.tenant_id,
      concat_ws(' ', s.first_name, s.last_name) as display_name,
      s.grade
    from public.students s
    join public.student_guardians sg
      on sg.student_id = s.id
      and sg.tenant_id = s.tenant_id
      and sg.guardian_id = v_guardian_id
      and sg.status = 'active'
    where s.tenant_id = v_tenant_id
      and s.status = 'active'
  ),
  service_candidates as (
    select distinct
      es.id as student_id,
      bra.id as service_id,
      bra.tenant_id,
      bra.bus_id,
      bra.route_id,
      bra.route_trip_pattern_id,
      b.bus_number,
      b.license_plate,
      rtp.direction,
      sba.pickup_stop_id,
      sba.dropoff_stop_id
    from eligible_students es
    join public.student_bus_assignments sba
      on sba.student_id = es.id
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
    join public.buses b
      on b.id = bra.bus_id
      and b.tenant_id = es.tenant_id
      and b.status = 'active'
    join public.routes r
      on r.id = bra.route_id
      and r.tenant_id = es.tenant_id
      and r.status = 'active'
    join public.route_trip_patterns rtp
      on rtp.id = bra.route_trip_pattern_id
      and rtp.route_id = bra.route_id
      and rtp.tenant_id = bra.tenant_id
      and rtp.status = 'active'
  ),
  service_rollup as (
    select
      sc.student_id,
      count(distinct sc.bus_id) as bus_count,
      min(sc.bus_id::text)::uuid as only_bus_id
    from service_candidates sc
    group by sc.student_id
  ),
  selected_services as (
    select sc.*
    from service_candidates sc
    join service_rollup sr
      on sr.student_id = sc.student_id
      and sr.bus_count = 1
      and sr.only_bus_id = sc.bus_id
  ),
  selected_bus as (
    select distinct
      ss.student_id,
      ss.tenant_id,
      ss.bus_id,
      ss.bus_number,
      ss.license_plate
    from selected_services ss
  ),
  trip_candidates as (
    select distinct
      ss.student_id,
      dt.id as driver_trip_id,
      dt.tenant_id,
      dt.driver_id,
      dt.bus_id,
      dt.route_id,
      dt.route_trip_pattern_id,
      dt.started_at,
      ss.direction,
      ss.pickup_stop_id,
      ss.dropoff_stop_id
    from selected_services ss
    join public.driver_trips dt
      on dt.tenant_id = ss.tenant_id
      and dt.bus_id = ss.bus_id
      and dt.route_id = ss.route_id
      and dt.route_trip_pattern_id = ss.route_trip_pattern_id
      and dt.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = ss.tenant_id
      and d.status = 'active'
  ),
  trip_rollup as (
    select
      tc.student_id,
      count(distinct tc.driver_trip_id) as trip_count,
      min(tc.driver_trip_id::text)::uuid as only_driver_trip_id
    from trip_candidates tc
    group by tc.student_id
  ),
  selected_trip as (
    select distinct on (tc.student_id) tc.*
    from trip_candidates tc
    join trip_rollup tr
      on tr.student_id = tc.student_id
      and tr.trip_count = 1
      and tr.only_driver_trip_id = tc.driver_trip_id
    order by tc.student_id, tc.driver_trip_id, tc.pickup_stop_id nulls last, tc.dropoff_stop_id nulls last
  ),
  live_state as (
    select
      es.id as student_id,
      coalesce(sr.bus_count, 0) as bus_count,
      coalesce(tr.trip_count, 0) as trip_count,
      loc.latitude as raw_latitude,
      loc.longitude as raw_longitude,
      loc.recorded_at as raw_recorded_at,
      loc.speed_mps,
      case
        when loc.recorded_at is null then null::bigint
        else floor(extract(epoch from (now() - loc.recorded_at)))::bigint
      end as raw_age_seconds
    from eligible_students es
    left join service_rollup sr on sr.student_id = es.id
    left join trip_rollup tr on tr.student_id = es.id
    left join selected_trip st on st.student_id = es.id
    left join public.driver_trip_current_locations loc
      on loc.driver_trip_id = st.driver_trip_id
      and loc.tenant_id = st.tenant_id
      and loc.driver_id = st.driver_id
      and loc.bus_id = st.bus_id
      and loc.route_id = st.route_id
  )
  select
    es.id,
    es.display_name,
    es.grade,
    case
      when ls.bus_count = 0 then 'unassigned'
      when ls.bus_count = 1 then 'assigned'
      else 'unavailable'
    end,
    case when ls.bus_count = 1 then sb.bus_number else null::text end,
    case when ls.bus_count = 1 then sb.license_plate else null::text end,
    ls.bus_count = 1 and ls.trip_count = 1,
    case
      when ls.bus_count <> 1 or ls.trip_count = 0 then 'inactive'
      when ls.trip_count > 1 then 'invalid'
      when ls.raw_recorded_at is null then 'missing'
      when ls.raw_latitude is null
        or ls.raw_longitude is null
        or ls.raw_latitude not between -90 and 90
        or ls.raw_longitude not between -180 and 180
        or ls.raw_age_seconds is null
        or ls.raw_age_seconds < 0
        or ls.raw_recorded_at > now() then 'invalid'
      when ls.raw_recorded_at < now() - interval '2 minutes' then 'stale'
      else 'fresh'
    end,
    case
      when ls.trip_count = 1
        and ls.raw_recorded_at >= now() - interval '2 minutes'
        and ls.raw_recorded_at <= now()
        and ls.raw_latitude between -90 and 90
        and ls.raw_longitude between -180 and 180
      then ls.raw_latitude
      else null::double precision
    end,
    case
      when ls.trip_count = 1
        and ls.raw_recorded_at >= now() - interval '2 minutes'
        and ls.raw_recorded_at <= now()
        and ls.raw_latitude between -90 and 90
        and ls.raw_longitude between -180 and 180
      then ls.raw_longitude
      else null::double precision
    end,
    case
      when ls.trip_count = 1
        and ls.raw_recorded_at is not null
        and ls.raw_recorded_at <= now()
      then ls.raw_recorded_at
      else null::timestamptz
    end,
    case
      when ls.trip_count = 1
        and ls.raw_recorded_at is not null
        and ls.raw_recorded_at <= now()
      then greatest(ls.raw_age_seconds, 0::bigint)
      else null::bigint
    end,
    case
      when ls.trip_count <> 1 then 'waiting_for_trip'
      else coalesce(eta.eta_status, 'temporarily_unavailable')
    end,
    case
      when ls.trip_count <> 1 then 'Waiting for the bus run to start'
      else coalesce(eta.eta_label, 'ETA temporarily unavailable')
    end,
    case
      when ls.trip_count <> 1 then 'no_active_trip'
      when events.dropoff_event_time is not null then 'dropped_off'
      when events.pickup_event_time is not null then 'picked_up'
      else 'not_picked_up'
    end,
    events.pickup_event_time,
    events.dropoff_event_time,
    greatest(events.pickup_event_time, events.dropoff_event_time)
  from eligible_students es
  left join live_state ls on ls.student_id = es.id
  left join selected_bus sb on sb.student_id = es.id
  left join selected_trip st on st.student_id = es.id
  left join lateral (
    select calculated.*
    from public.calculate_safe_route_eta(
      st.route_id,
      case when st.direction = 'reverse' then st.dropoff_stop_id else st.pickup_stop_id end,
      st.route_trip_pattern_id,
      ls.raw_latitude,
      ls.raw_longitude,
      ls.speed_mps,
      ls.raw_recorded_at
    ) calculated
    where st.driver_trip_id is not null
  ) eta on true
  left join lateral (
    select
      max(e.event_time) filter (where e.event_type = 'picked_up') as pickup_event_time,
      max(e.event_time) filter (where e.event_type = 'dropped_off') as dropoff_event_time
    from public.student_trip_events e
    where e.driver_trip_id = st.driver_trip_id
      and e.student_id = es.id
      and e.tenant_id = es.tenant_id
  ) events on st.driver_trip_id is not null
  order by es.display_name, es.id;
end;
$$;

revoke all on function public.get_guardian_bus_visibility() from public, anon;
grant execute on function public.get_guardian_bus_visibility() to authenticated;

-- Retire route-oriented guardian browser contracts. Their definitions remain
-- for migration compatibility, but no browser role can execute them.
revoke execute on function public.get_guardian_student_route_visibility() from authenticated;
revoke execute on function public.get_guardian_live_trip_visibility() from authenticated;
revoke execute on function public.get_guardian_live_route_overlays() from authenticated;
revoke execute on function public.get_guardian_student_trip_event_visibility() from authenticated;
revoke execute on function public.get_guardian_student_live_bus_location_state() from authenticated;

comment on function public.get_guardian_bus_visibility() is
  'Guardian-only bus-first view for linked students. Route, stop, driver, bus UUID, and trip UUID fields are used only for exact service authorization and are not returned.';
