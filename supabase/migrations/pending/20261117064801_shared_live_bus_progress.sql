-- Only current derived progress is retained; no raw GPS, names or access decisions.
create table safebus_private.live_bus_progress_cache (
  driver_trip_id uuid primary key references public.driver_trip_current_locations(driver_trip_id) on delete cascade,
  tenant_id uuid not null,
  input_digest text not null,
  progress_data jsonb not null
);
alter table safebus_private.live_bus_progress_cache enable row level security;
revoke all on safebus_private.live_bus_progress_cache from public, anon, authenticated, service_role;

create function safebus_private.invalidate_live_bus_progress() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $function$
begin
  if tg_table_name = 'driver_trips' then
    delete from safebus_private.live_bus_progress_cache where driver_trip_id = old.id;
  else
    delete from safebus_private.live_bus_progress_cache where driver_trip_id = old.driver_trip_id;
  end if;
  return new;
end;
$function$;
revoke all on function safebus_private.invalidate_live_bus_progress() from public, anon, authenticated, service_role;
create trigger invalidate_live_bus_progress_location
  after update of latitude, longitude, accuracy_m, speed_mps, recorded_at, tenant_id, driver_id, bus_id, route_id
  on public.driver_trip_current_locations for each row execute function safebus_private.invalidate_live_bus_progress();
create trigger invalidate_live_bus_progress_trip
  after update of status, route_shape_id, tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id
  on public.driver_trips for each row execute function safebus_private.invalidate_live_bus_progress();

create function safebus_private.shared_live_bus_progress(
  p_tenant_id uuid, p_service jsonb, p_stops jsonb, p_path text
) returns jsonb
language plpgsql volatile security invoker
set search_path = pg_catalog, extensions, pg_temp
as $function$
declare
  v_tenant_id uuid := p_tenant_id;
  v_service record;
  v_digest text := encode(sha256(convert_to(jsonb_build_array(
    'live-bus-progress-v1', p_tenant_id, p_service, p_stops, p_path
  )::text, 'UTF8')), 'hex');
  v_result jsonb;
  v_cache_write boolean := false;
begin
  select * into v_service from jsonb_to_record(p_service) as s(
    driver_trip_id uuid, driver_id uuid, bus_id uuid, route_id uuid,
    route_trip_pattern_id uuid, route_shape_id uuid, trip_status text,
    location_state text, raw_latitude double precision, raw_longitude double precision,
    raw_recorded_at timestamptz, accuracy_m double precision, speed_mps double precision
  );
  -- Freshness is recomputed by the caller on every authorized request. A stale,
  -- future, missing or invalid GPS record never reuses live progress.
  if v_service.location_state = 'fresh' and v_service.trip_status in ('active','paused') then
    select c.progress_data into v_result from safebus_private.live_bus_progress_cache c
    where c.driver_trip_id = v_service.driver_trip_id and c.tenant_id = p_tenant_id
      and c.input_digest = v_digest;
    if found then return v_result; end if;
    if current_setting('transaction_read_only') = 'off' then
      v_cache_write := pg_try_advisory_xact_lock(hashtextextended(
        'safebus:live-progress:' || v_service.driver_trip_id::text, 0));
    end if;
    if v_cache_write then
      select c.progress_data into v_result from safebus_private.live_bus_progress_cache c
      where c.driver_trip_id = v_service.driver_trip_id and c.tenant_id = p_tenant_id
        and c.input_digest = v_digest;
      if found then return v_result; end if;
    end if;
  end if;
  with ordered_stops as (
    select * from jsonb_to_recordset(p_stops) as s(
      id uuid, stop_name text, stop_order integer, latitude double precision,
      longitude double precision, planned_arrival_time time,
      display_index integer, stop_count integer
    )
  ), shape_context as (
    select p_path::extensions.geometry as path where p_path is not null
    ), location_context as (
      select
        case
          when v_service.location_state = 'fresh' then
            extensions.st_setsrid(
              extensions.st_makepoint(v_service.raw_longitude, v_service.raw_latitude),
              4326
            )
          else null
        end as bus_point,
        greatest(75.0, least(250.0, coalesce(v_service.accuracy_m, 25.0) * 2.0)) as shape_tolerance_m,
        greatest(100.0, least(300.0, coalesce(v_service.accuracy_m, 25.0) * 2.0)) as fallback_tolerance_m
    ), shared_geometry as materialized (
      -- Only static route inputs enter this cache. Names, permissions and GPS
      -- remain in this request's statement snapshot.
      select safebus_private.shared_route_stop_geometry(
        v_tenant_id, v_service.route_id, v_service.route_trip_pattern_id,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', os.id, 'display_index', os.display_index,
          'latitude', os.latitude, 'longitude', os.longitude,
          'planned_arrival_time', os.planned_arrival_time
        ) order by os.display_index) from ordered_stops os), '[]'::jsonb),
        (select sc.path::text from shape_context sc)
      ) as data
    ), located_stops as (
      select os.*,
        case when os.latitude is not null and os.longitude is not null then
          extensions.st_setsrid(extensions.st_makepoint(os.longitude, os.latitude), 4326)
        end as stop_point,
        geometry.shape_fraction, geometry.distance_m, geometry.scheduled_seconds
      from ordered_stops os
      cross join shared_geometry cached
      join lateral jsonb_to_recordset(cached.data) as geometry(
        id uuid, shape_fraction double precision, distance_m double precision,
        scheduled_seconds integer
      ) on geometry.id = os.id
    ), stop_segments as (
      select
        ls.*,
        lead(ls.display_index) over (order by ls.display_index) as next_display_index,
        lead(ls.stop_point) over (order by ls.display_index) as next_stop_point,
        lead(ls.shape_fraction) over (order by ls.display_index) as next_shape_fraction,
        lead(ls.planned_arrival_time) over (order by ls.display_index) as next_planned_arrival_time
      from located_stops ls
    ), shape_bus as (
      select
        sc.path,
        lc.bus_point,
        lc.shape_tolerance_m,
        extensions.st_linelocatepoint(sc.path, lc.bus_point) as bus_fraction,
        extensions.st_distance(sc.path::extensions.geography, lc.bus_point::extensions.geography) as off_route_m
      from shape_context sc
      cross join location_context lc
      where lc.bus_point is not null
    ), shape_projection as (
      select
        ss.display_index,
        least(1.0, greatest(0.0,
          (sb.bus_fraction - ss.shape_fraction)
          / nullif(ss.next_shape_fraction - ss.shape_fraction, 0)
        )) as segment_fraction,
        sb.off_route_m,
        sb.shape_tolerance_m
      from shape_bus sb
      join stop_segments ss
        on ss.next_shape_fraction is not null
        and ss.shape_fraction is not null
      order by
        case when sb.bus_fraction between least(ss.shape_fraction, ss.next_shape_fraction)
          and greatest(ss.shape_fraction, ss.next_shape_fraction) then 0 else 1 end,
        least(
          abs(sb.bus_fraction - ss.shape_fraction),
          abs(sb.bus_fraction - ss.next_shape_fraction)
        ),
        ss.display_index
      limit 1
    ), fallback_projection as (
      select
        ss.display_index,
        extensions.st_linelocatepoint(
          extensions.st_makeline(ss.stop_point, ss.next_stop_point),
          lc.bus_point
        ) as segment_fraction,
        extensions.st_distance(
          extensions.st_makeline(ss.stop_point, ss.next_stop_point)::extensions.geography,
          lc.bus_point::extensions.geography
        ) as off_route_m,
        lc.fallback_tolerance_m
      from stop_segments ss
      cross join location_context lc
      where not exists (select 1 from shape_context)
        and lc.bus_point is not null
        and ss.stop_point is not null
        and ss.next_stop_point is not null
      order by
        extensions.st_distance(
          extensions.st_makeline(ss.stop_point, ss.next_stop_point)::extensions.geography,
          lc.bus_point::extensions.geography
        ),
        ss.display_index
      limit 1
    ), progress_model as (
      select
        (sp.display_index + sp.segment_fraction)::double precision as display_position,
        'route_shape'::text as progress_source
      from shape_projection sp
      where sp.off_route_m <= sp.shape_tolerance_m
      union all
      select
        (fp.display_index + fp.segment_fraction)::double precision,
        'stop_sequence'::text
      from fallback_projection fp
      where fp.off_route_m <= fp.fallback_tolerance_m
      limit 1
    ), segments as (
      select ss.display_index, ss.distance_m, ss.scheduled_seconds
      from stop_segments ss
      where ss.next_display_index is not null
    ), stop_states as (
      select
        ls.*,
        pm.display_position,
        pm.progress_source,
        case
          when pm.display_position is null then 'unavailable'
          when ls.display_index < pm.display_position - 0.06 then 'passed'
          when abs(ls.display_index - pm.display_position) <= 0.06 then 'at_stop'
          when ls.display_index = case
            when abs(pm.display_position - round(pm.display_position)) <= 0.06
              then floor(pm.display_position)::integer + 1
            else ceil(pm.display_position)::integer
          end then 'next'
          when ls.display_index > pm.display_position then 'upcoming'
          else 'passed'
        end as service_state
      from located_stops ls
      left join progress_model pm on true
    ), stop_eta as (
      select
        state.*,
        eta.seconds_to_stop,
        case
          when state.service_state = 'passed' then 'passed'
          when v_service.trip_status = 'paused' then 'paused'
          when v_service.trip_status is distinct from 'active'
            or v_service.location_state <> 'fresh'
            or state.display_position is null then 'unavailable'
          when state.service_state = 'at_stop' then 'arriving_soon'
          when eta.seconds_to_stop is null or eta.seconds_to_stop > 5400 then 'unavailable'
          when eta.seconds_to_stop <= 180 then 'arriving_soon'
          else 'available'
        end as eta_status
      from stop_states state
      left join lateral (
        select
          case
            when state.service_state = 'at_stop' then 0.0
            when state.service_state not in ('next', 'upcoming') then null
            else
              (
                select
                  greatest(0.0, 1.0 - (state.display_position - floor(state.display_position)))
                  * current_segment.distance_m
                  / greatest(
                    3.0,
                    least(
                      15.0,
                      case
                        when v_service.speed_mps between 3 and 15
                          and current_segment.scheduled_seconds between 1 and 14400
                          and current_segment.distance_m > 0 then
                          (v_service.speed_mps * 0.6)
                          + ((current_segment.distance_m / current_segment.scheduled_seconds) * 0.4)
                        when v_service.speed_mps between 3 and 15 then v_service.speed_mps
                        when current_segment.scheduled_seconds between 1 and 14400
                          and current_segment.distance_m > 0 then
                          current_segment.distance_m / current_segment.scheduled_seconds
                        else 8.0
                      end
                    )
                  )
                from segments current_segment
                where current_segment.display_index = floor(state.display_position)::integer
                  and current_segment.distance_m is not null
                  and current_segment.distance_m > 0
              )
              + coalesce((
                select sum(
                  case
                    when later_segment.scheduled_seconds between 1 and 14400
                      then later_segment.scheduled_seconds
                    when later_segment.distance_m is not null
                      then later_segment.distance_m / 8.0
                    else 0.0
                  end
                )
                from segments later_segment
                where later_segment.display_index >= ceil(state.display_position)::integer
                  and later_segment.display_index < state.display_index
              ), 0.0)
          end as seconds_to_stop
      ) eta on true
    ), stop_output as (
      select
        se.*,
        case
          when se.eta_status = 'arriving_soon' and se.service_state = 'at_stop' then 0
          when se.eta_status in ('available', 'arriving_soon') then
            ceil(greatest(1.0, se.seconds_to_stop / 60.0))::integer
        end as eta_min_minutes
      from stop_eta se

    )
    select jsonb_build_object(
      'display_position', (select display_position from progress_model),
      'progress_source', (select progress_source from progress_model),
      'stop_count', (select max(stop_count) from ordered_stops),
      'stops', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'service_state', s.service_state,
        'eta_status', s.eta_status, 'eta_min_minutes', s.eta_min_minutes
      ) order by s.display_index) from stop_output s), '[]'::jsonb)
    ) into v_result;

  if v_cache_write then
    -- Do the expensive calculation before taking source-row locks. A brief
    -- NOWAIT share lock makes the source check and cache insert atomic with
    -- GPS/trip invalidation. If either row changed or is busy, return the exact
    -- computed response without filling the cache. Never wait for an ingest.
    begin
      perform 1 from public.driver_trips d
      where d.id = v_service.driver_trip_id and d.tenant_id = p_tenant_id
        and d.driver_id = v_service.driver_id and d.bus_id = v_service.bus_id
        and d.route_id = v_service.route_id
        and d.route_trip_pattern_id = v_service.route_trip_pattern_id
        and d.route_shape_id is not distinct from v_service.route_shape_id
        and d.status = v_service.trip_status and d.status in ('active','paused')
      for share nowait;
      if found then
        perform 1 from public.driver_trip_current_locations l
        where l.driver_trip_id = v_service.driver_trip_id and l.tenant_id = p_tenant_id
          and l.driver_id = v_service.driver_id and l.bus_id = v_service.bus_id
          and l.route_id = v_service.route_id
          and l.recorded_at is not distinct from v_service.raw_recorded_at
          and l.latitude is not distinct from v_service.raw_latitude
          and l.longitude is not distinct from v_service.raw_longitude
          and l.accuracy_m is not distinct from v_service.accuracy_m
          and l.speed_mps is not distinct from v_service.speed_mps
        for share nowait;
        if found then
          insert into safebus_private.live_bus_progress_cache(driver_trip_id,tenant_id,input_digest,progress_data)
          values(v_service.driver_trip_id,p_tenant_id,v_digest,v_result)
          on conflict(driver_trip_id) do update set tenant_id=excluded.tenant_id,
            input_digest=excluded.input_digest,progress_data=excluded.progress_data;
        end if;
      end if;
    exception when lock_not_available then
      -- The subtransaction also releases any source locks already acquired.
      null;
    end;
  end if;
  return v_result;
end;
$function$;
revoke all on function safebus_private.shared_live_bus_progress(uuid,jsonb,jsonb,text)
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_guardian_bus_service_lines(p_bus_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
  v_bus_number text := nullif(trim(p_bus_number), '');
  v_result jsonb := '[]'::jsonb;
  v_service record;
  v_line jsonb;
begin
  if auth.uid() is null
    or public.is_current_user_session_active() is not true
    or safebus_private.has_completed_optional_mfa() is not true
    or safebus_private.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian bus service lines require an active guardian login.'
      using errcode = '42501';
  end if;

  v_tenant_id := safebus_private.current_tenant_id();
  v_guardian_id := safebus_private.current_guardian_id();
  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian bus service lines require an active guardian identity.'
      using errcode = '42501';
  end if;

  if v_bus_number is null or length(v_bus_number) > 64 then
    raise exception 'A valid bus number is required.' using errcode = '22023';
  end if;

  for v_service in
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
        and sba.effective_from <= ((now() AT TIME ZONE 'America/Edmonton')::date)
        and (sba.effective_to is null or sba.effective_to >= ((now() AT TIME ZONE 'America/Edmonton')::date))
      join public.bus_route_assignments bra
        on bra.id = sba.bus_route_assignment_id
        and bra.tenant_id = s.tenant_id
        and bra.route_trip_pattern_id = sba.route_trip_pattern_id
        and bra.status = 'active'
        and (bra.effective_from is null or bra.effective_from <= ((now() AT TIME ZONE 'America/Edmonton')::date))
        and (bra.effective_to is null or bra.effective_to >= ((now() AT TIME ZONE 'America/Edmonton')::date))
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
    )
    select
      es.*,
      trip.id as driver_trip_id,
      trip.driver_id,
      trip.status as trip_status,
      trip.route_shape_id,
      loc.latitude as raw_latitude,
      loc.longitude as raw_longitude,
      loc.accuracy_m,
      loc.speed_mps,
      loc.recorded_at as raw_recorded_at,
      case
        when trip.id is null then 'inactive'
        when loc.recorded_at is null then 'missing'
        when loc.latitude is null
          or loc.longitude is null
          or loc.latitude not between -90 and 90
          or loc.longitude not between -180 and 180
          or loc.recorded_at > now()
          or (loc.accuracy_m is not null and (loc.accuracy_m < 0 or loc.accuracy_m > 250))
          then 'invalid'
        when loc.recorded_at < now() - interval '2 minutes' then 'stale'
        else 'fresh'
      end as location_state
    from eligible_services es
    left join lateral (
      select dt.id, dt.driver_id, dt.status, dt.route_shape_id, dt.started_at
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
    order by
      case when trip.status = 'active' then 0 when trip.status = 'paused' then 1 else 2 end,
      es.trip_name,
      es.route_name,
      es.direction
  loop
    with ordered_stops as (
      select
        rs.id,
        rs.stop_name,
        rs.stop_order,
        rs.latitude::double precision as latitude,
        rs.longitude::double precision as longitude,
        rtss.planned_arrival_time,
        guardian_stops.pickup_student_names,
        guardian_stops.dropoff_student_names,
        (row_number() over (
          order by
            case when v_service.direction = 'forward' then rs.stop_order end asc,
            case when v_service.direction = 'reverse' then rs.stop_order end desc,
            rs.id
        ) - 1)::integer as display_index,
        count(*) over ()::integer as stop_count
      from public.route_stops rs
      left join public.route_trip_stop_schedules rtss
        on rtss.route_trip_pattern_id = v_service.route_trip_pattern_id
        and rtss.route_stop_id = rs.id
        and rtss.tenant_id = v_tenant_id
        and rtss.route_id = v_service.route_id
      left join lateral (
        select
          coalesce(
            jsonb_agg(linked.student_name order by linked.student_name)
              filter (where linked.is_pickup),
            '[]'::jsonb
          ) as pickup_student_names,
          coalesce(
            jsonb_agg(linked.student_name order by linked.student_name)
              filter (where linked.is_dropoff),
            '[]'::jsonb
          ) as dropoff_student_names
        from (
          select distinct
            coalesce(
              nullif(trim(linked_student.preferred_name), ''),
              linked_student.first_name
            ) as student_name,
            linked_assignment.pickup_stop_id = rs.id as is_pickup,
            linked_assignment.dropoff_stop_id = rs.id as is_dropoff
          from public.student_guardians linked_guardian
          join public.students linked_student
            on linked_student.id = linked_guardian.student_id
            and linked_student.tenant_id = linked_guardian.tenant_id
            and linked_student.status = 'active'
          join public.student_bus_assignments linked_assignment
            on linked_assignment.student_id = linked_student.id
            and linked_assignment.tenant_id = linked_student.tenant_id
            and linked_assignment.status = 'active'
            and linked_assignment.effective_from <= ((now() AT TIME ZONE 'America/Edmonton')::date)
            and (
              linked_assignment.effective_to is null
              or linked_assignment.effective_to >= ((now() AT TIME ZONE 'America/Edmonton')::date)
            )
          join public.bus_route_assignments linked_bus_route
            on linked_bus_route.id = linked_assignment.bus_route_assignment_id
            and linked_bus_route.tenant_id = linked_assignment.tenant_id
            and linked_bus_route.route_id = v_service.route_id
            and linked_bus_route.route_trip_pattern_id = v_service.route_trip_pattern_id
            and linked_bus_route.bus_id = v_service.bus_id
            and linked_bus_route.status = 'active'
            and (
              linked_bus_route.effective_from is null
              or linked_bus_route.effective_from <= ((now() AT TIME ZONE 'America/Edmonton')::date)
            )
            and (
              linked_bus_route.effective_to is null
              or linked_bus_route.effective_to >= ((now() AT TIME ZONE 'America/Edmonton')::date)
            )
          where linked_guardian.guardian_id = v_guardian_id
            and linked_guardian.tenant_id = v_tenant_id
            and linked_guardian.status = 'active'
            and (
              linked_guardian.access_expires_at is null
              or linked_guardian.access_expires_at > now()
            )
            and (
              linked_assignment.pickup_stop_id = rs.id
              or linked_assignment.dropoff_stop_id = rs.id
            )
        ) linked
      ) guardian_stops on true
      where rs.tenant_id = v_tenant_id
        and rs.route_id = v_service.route_id
        and rs.status = 'active'
    ), shape_context as (
      select route_shape.path
      from public.route_shapes route_shape
      where route_shape.id = v_service.route_shape_id
        and route_shape.tenant_id = v_tenant_id
        and route_shape.route_id = v_service.route_id
      limit 1
    ), shared_progress as materialized (
      select safebus_private.shared_live_bus_progress(
        v_tenant_id, to_jsonb(v_service),
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', os.id, 'stop_name', os.stop_name, 'stop_order', os.stop_order,
          'latitude', os.latitude, 'longitude', os.longitude,
          'planned_arrival_time', os.planned_arrival_time,
          'display_index', os.display_index, 'stop_count', os.stop_count
        ) order by os.display_index) from ordered_stops os), '[]'::jsonb),
        (select sc.path::text from shape_context sc)
      ) as data
    ), stop_output as (
      select os.*, metrics.service_state, metrics.eta_status, metrics.eta_min_minutes
      from ordered_stops os cross join shared_progress cached
      join lateral jsonb_to_recordset(cached.data->'stops') as metrics(
        id uuid, service_state text, eta_status text, eta_min_minutes integer
      ) on metrics.id = os.id
    ), next_stop as (
      select so.stop_name, so.stop_order
      from stop_output so
      where so.service_state = 'next'
      order by so.display_index
      limit 1
    ), output_context as (
      select (data->>'display_position')::double precision as display_position,
        data->>'progress_source' as progress_source,
        (data->>'stop_count')::integer as stop_count
      from shared_progress
    )
    select jsonb_build_object(
      'busNumber', v_service.bus_number,
      'trackingTopic', case when v_service.driver_trip_id is not null then
        'safebus:bus:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          v_service.driver_trip_id::text || ':safebus:bus:v1', 'UTF8')), 'hex') else null end,
      'licensePlate', v_service.license_plate,
      'routeName', v_service.route_name,
      'tripName', v_service.trip_name,
      'direction', v_service.direction,
      'tripStatus', coalesce(v_service.trip_status, 'inactive'),
      -- GPS validity is independent of the route-projection model.
      -- Off-route/missing geometry still suppresses progress and ETAs.
      'locationState', v_service.location_state,
      'latitude', case when oc.display_position is not null then v_service.raw_latitude else null end,
      'longitude', case when oc.display_position is not null then v_service.raw_longitude else null end,
      'locationRecordedAt', case
        when v_service.raw_recorded_at is not null and v_service.raw_recorded_at <= now()
        then v_service.raw_recorded_at
        else null
      end,
      'progressPosition', oc.display_position,
      'progressPercent', case
        when oc.display_position is not null and oc.stop_count > 1
        then round((oc.display_position / (oc.stop_count - 1) * 100.0)::numeric, 2)
        else null
      end,
      'progressSource', oc.progress_source,
      'nextStopName', ns.stop_name,
      'nextStopOrder', ns.stop_order,
      'etaUpdatedAt', case
        when v_service.trip_status = 'active'
          and v_service.location_state = 'fresh'
          and oc.display_position is not null
        then v_service.raw_recorded_at
        else null
      end,
      'stops', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', so.stop_name,
            'order', so.stop_order,
            'latitude', so.latitude,
            'longitude', so.longitude,
            'pickupStudentNames', so.pickup_student_names,
            'dropoffStudentNames', so.dropoff_student_names,
            'plannedArrivalTime', so.planned_arrival_time,
            'serviceState', so.service_state,
            'etaStatus', so.eta_status,
            'etaMinMinutes', so.eta_min_minutes,
            'etaMaxMinutes', case
              when so.eta_min_minutes is null then null
              when so.eta_min_minutes = 0 then 0
              else least(90, so.eta_min_minutes + greatest(3, ceil(so.eta_min_minutes * 0.35)::integer))
            end,
            'etaLabel', case
              when so.eta_status = 'passed' then 'Passed'
              when so.eta_status = 'paused' then 'ETA paused'
              when so.eta_status = 'arriving_soon' and so.service_state = 'at_stop' then 'Arriving now'
              when so.eta_status = 'arriving_soon' then 'Arriving soon'
              when so.eta_status = 'available'
                then so.eta_min_minutes::text || '–' || least(90, so.eta_min_minutes + greatest(3, ceil(so.eta_min_minutes * 0.35)::integer))::text || ' min'
              else 'ETA unavailable'
            end
          )
          order by so.display_index
        )
        from stop_output so
      ), '[]'::jsonb)
    )
    into v_line
    from output_context oc
    left join next_stop ns on true;

    v_result := v_result || jsonb_build_array(v_line);
  end loop;

  return v_result;
end;
$function$;
