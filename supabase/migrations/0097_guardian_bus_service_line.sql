-- SafeBus Alberta - guardian bus service line
--
-- Adds a narrow, read-only route presentation contract for the bus detail
-- screen. A guardian can request only a bus currently assigned to one of their
-- active linked students. The response contains ordered public-facing stop
-- labels/coordinates and the single current bus position. It never returns
-- operational UUIDs, driver identity/contact data, other students, or location
-- history.

create or replace function public.get_guardian_bus_service_lines(p_bus_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
  v_bus_number text := nullif(trim(p_bus_number), '');
  v_result jsonb;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian bus service lines require an active guardian login.'
      using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  v_guardian_id := public.current_guardian_id();
  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian bus service lines require an active guardian identity.'
      using errcode = '42501';
  end if;

  if v_bus_number is null or length(v_bus_number) > 64 then
    raise exception 'A valid bus number is required.' using errcode = '22023';
  end if;

  with eligible_services as (
    select distinct
      b.id as bus_id,
      b.bus_number,
      b.license_plate,
      bra.route_id,
      bra.route_trip_pattern_id,
      r.route_name,
      rtp.display_name as trip_name,
      rtp.direction
    from public.student_guardians sg
    join public.students s
      on s.id = sg.student_id
      and s.tenant_id = sg.tenant_id
      and s.status = 'active'
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
    join public.buses b
      on b.id = bra.bus_id
      and b.tenant_id = s.tenant_id
      and b.status = 'active'
    join public.routes r
      on r.id = bra.route_id
      and r.tenant_id = s.tenant_id
      and r.status = 'active'
    join public.route_trip_patterns rtp
      on rtp.id = bra.route_trip_pattern_id
      and rtp.route_id = bra.route_id
      and rtp.tenant_id = bra.tenant_id
      and rtp.status = 'active'
    where sg.guardian_id = v_guardian_id
      and sg.tenant_id = v_tenant_id
      and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
      and lower(b.bus_number) = lower(v_bus_number)
  ), service_rows as (
    select
      es.*,
      trip.id as driver_trip_id,
      trip.driver_id,
      trip.status as trip_status,
      loc.latitude as raw_latitude,
      loc.longitude as raw_longitude,
      loc.recorded_at as raw_recorded_at,
      case
        when loc.recorded_at is null then null::bigint
        else floor(extract(epoch from (now() - loc.recorded_at)))::bigint
      end as raw_age_seconds
    from eligible_services es
    left join lateral (
      select dt.id, dt.driver_id, dt.status, dt.started_at
      from public.driver_trips dt
      join public.drivers d
        on d.id = dt.driver_id
        and d.tenant_id = v_tenant_id
        and d.status = 'active'
      where dt.tenant_id = v_tenant_id
        and dt.bus_id = es.bus_id
        and dt.route_id = es.route_id
        and dt.route_trip_pattern_id = es.route_trip_pattern_id
        and dt.status in ('active', 'paused')
      order by dt.started_at desc, dt.id
      limit 1
    ) trip on true
    left join public.driver_trip_current_locations loc
      on loc.driver_trip_id = trip.id
      and loc.tenant_id = v_tenant_id
      and loc.driver_id = trip.driver_id
      and loc.bus_id = es.bus_id
      and loc.route_id = es.route_id
  ), safe_services as (
    select
      sr.*,
      case
        when sr.driver_trip_id is null then 'inactive'
        when sr.raw_recorded_at is null then 'missing'
        when sr.raw_latitude is null
          or sr.raw_longitude is null
          or sr.raw_latitude not between -90 and 90
          or sr.raw_longitude not between -180 and 180
          or sr.raw_age_seconds is null
          or sr.raw_age_seconds < 0
          or sr.raw_recorded_at > now() then 'invalid'
        when sr.raw_recorded_at < now() - interval '2 minutes' then 'stale'
        else 'fresh'
      end as location_state
    from service_rows sr
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'busNumber', ss.bus_number,
        'licensePlate', ss.license_plate,
        'routeName', ss.route_name,
        'tripName', ss.trip_name,
        'direction', ss.direction,
        'tripStatus', coalesce(ss.trip_status, 'inactive'),
        'locationState', ss.location_state,
        'latitude', case when ss.location_state = 'fresh' then ss.raw_latitude else null end,
        'longitude', case when ss.location_state = 'fresh' then ss.raw_longitude else null end,
        'locationRecordedAt', case
          when ss.driver_trip_id is not null and ss.raw_recorded_at <= now()
          then ss.raw_recorded_at
          else null
        end,
        'stops', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', rs.stop_name,
                'order', rs.stop_order,
                'latitude', rs.latitude,
                'longitude', rs.longitude,
                'plannedArrivalTime', rtss.planned_arrival_time
              )
              order by
                case when ss.direction = 'forward' then rs.stop_order end asc,
                case when ss.direction = 'reverse' then rs.stop_order end desc,
                rs.id
            ),
            '[]'::jsonb
          )
          from public.route_stops rs
          left join public.route_trip_stop_schedules rtss
            on rtss.route_trip_pattern_id = ss.route_trip_pattern_id
            and rtss.route_stop_id = rs.id
            and rtss.tenant_id = v_tenant_id
            and rtss.route_id = ss.route_id
          where rs.tenant_id = v_tenant_id
            and rs.route_id = ss.route_id
            and rs.status = 'active'
        )
      )
      order by
        case when ss.trip_status = 'active' then 0 when ss.trip_status = 'paused' then 1 else 2 end,
        ss.trip_name,
        ss.route_name,
        ss.direction
    ),
    '[]'::jsonb
  )
  into v_result
  from safe_services ss;

  return v_result;
end;
$$;

revoke all on function public.get_guardian_bus_service_lines(text) from public, anon;
grant execute on function public.get_guardian_bus_service_lines(text) to authenticated;

comment on function public.get_guardian_bus_service_lines(text) is
  'Guardian-scoped ordered stop lines and current bus point for services assigned to active linked students. Returns no operational UUIDs, driver data, other students, or location history.';
