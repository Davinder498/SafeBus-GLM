-- Prepared forward change for the existing BusSafe project. Protected adoption only.
-- Both RPCs run as the caller. Event reads receive a narrowly scoped authenticated
-- SELECT policy; existing restrictive session/MFA policies remain in force.
create policy safebus_admin_trip_event_read on public.student_trip_events
for select to authenticated using (
  public.is_current_user_session_active()
  and safebus_private.has_verified_mfa()
  and safebus_private.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
  and tenant_id = safebus_private.current_tenant_id()
  and exists (
    select 1 from public.driver_trips dt
    join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
    join public.students s on s.id = student_trip_events.student_id and s.tenant_id = dt.tenant_id
    where dt.id = student_trip_events.driver_trip_id
      and dt.tenant_id = student_trip_events.tenant_id
      and (safebus_private.current_user_role() <> 'school_admin'
        or (r.school_id = safebus_private.current_school_id()
          and s.school_id = safebus_private.current_school_id()))
  )
);
grant select (tenant_id, driver_trip_id, student_id, event_type, event_time, route_stop_id)
  on public.student_trip_events to authenticated;

create function public.get_admin_trip_operations(
  p_from_date date default null, p_to_date date default null,
  p_status text default null, p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tenant uuid := safebus_private.current_tenant_id();
  v_role text := safebus_private.current_user_role()::text;
  v_result jsonb;
begin
  if auth.uid() is null or v_tenant is null or v_role is null
    or v_role not in ('tenant_admin','school_admin','transportation_admin')
    or not coalesce(public.is_current_user_session_active(),false)
    or not coalesce(safebus_private.has_verified_mfa(),false)
    or (v_role = 'school_admin' and safebus_private.current_school_id() is null) then
    raise exception 'An authorized administrator with MFA is required.' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not in (25,50,100)
    or (p_from_date is null) <> (p_to_date is null) or p_from_date > p_to_date
    or (p_from_date is not null and (not isfinite(p_from_date) or not isfinite(p_to_date)))
    or (p_status is not null and p_status not in ('active','paused','completed','cancelled','ongoing')) then
    raise exception 'Choose valid trip filters.' using errcode = '22023';
  end if;
  with filtered as materialized (
    select dt.id as trip_id, dt.service_date, dt.status, dt.started_at, dt.ended_at,
      r.route_name, r.route_code, coalesce(dt.trip_name_snapshot,rtp.display_name) as trip_pattern_name,
      rtp.direction, coalesce(dt.bus_number_snapshot,b.bus_number) as bus_label,
      p.full_name as driver_label, dt.route_id, dt.route_trip_pattern_id,
      dt.tenant_id, dt.bus_id, dt.driver_id,
      case when dt.status in ('active','paused') then 0 else 1 end as priority
    from public.driver_trips dt
    join public.routes r on r.id=dt.route_id and r.tenant_id=dt.tenant_id
    join public.route_trip_patterns rtp on rtp.id=dt.route_trip_pattern_id and rtp.route_id=dt.route_id and rtp.tenant_id=dt.tenant_id
    join public.buses b on b.id=dt.bus_id and b.tenant_id=dt.tenant_id
    join public.drivers d on d.id=dt.driver_id and d.tenant_id=dt.tenant_id
    join public.profiles p on p.id=d.profile_id and p.tenant_id=dt.tenant_id
    where dt.tenant_id=v_tenant
      and (v_role <> 'school_admin' or r.school_id=safebus_private.current_school_id())
      and dt.status in ('active','paused','completed','cancelled')
      and (p_from_date is null or dt.service_date between p_from_date and p_to_date)
      and (p_status is null or dt.status=p_status or (p_status='ongoing' and dt.status in ('active','paused')))
  ), page_rows as (
    select * from filtered order by priority, service_date desc, started_at desc, trip_id
    limit p_page_size offset ((p_page::bigint-1)*p_page_size)
  ), enriched as (
    select f.*, case
      when f.status not in ('active','paused') then 'not_applicable'
      when loc.recorded_at is null then 'missing'
      when loc.recorded_at > now()+interval '30 seconds' then 'invalid'
      when loc.recorded_at < now()-interval '2 minutes' then 'stale'
      else 'live' end as location_status,
      loc.recorded_at as latest_location_at,
      eta.eta_label, eta.next_stop_name
    from page_rows f
    left join public.driver_trip_current_locations loc on f.status in ('active','paused')
      and loc.driver_trip_id=f.trip_id and loc.tenant_id=f.tenant_id and loc.driver_id=f.driver_id
      and loc.bus_id=f.bus_id and loc.route_id=f.route_id
    left join lateral (
      select rs.id from public.route_stops rs where rs.route_id=f.route_id
        and rs.tenant_id=f.tenant_id and rs.status='active'
      order by case when f.direction='forward' then rs.stop_order end desc,
        case when f.direction='reverse' then rs.stop_order end asc, rs.id limit 1
    ) target on f.status='active'
    left join lateral safebus_private.calculate_safe_route_eta(f.route_id,target.id,
      f.route_trip_pattern_id,loc.latitude,loc.longitude,loc.speed_mps,loc.recorded_at) eta
      on f.status='active' and loc.recorded_at between now()-interval '2 minutes' and now()+interval '30 seconds'
  ) select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'trip_id',trip_id,'service_date',service_date,'status',status,'started_at',started_at,'ended_at',ended_at,
      'route_name',route_name,'route_code',route_code,'trip_pattern_name',trip_pattern_name,
      'direction',direction,'bus_label',bus_label,'driver_label',driver_label,
      'location_status',location_status,'latest_location_at',latest_location_at,
      'eta_label',case when location_status='live' and status='active' then eta_label end,
      'next_stop_name',case when location_status='live' and status='active' then next_stop_name end
    ) order by priority,service_date desc,started_at desc,trip_id) from enriched),'[]'::jsonb),
    'totalCount',(select count(*) from filtered)) into v_result;
  return v_result;
end;
$$;

create function public.get_admin_trip_detail(p_trip_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tenant uuid := safebus_private.current_tenant_id();
  v_role text := safebus_private.current_user_role()::text;
  v_trip record;
  v_summary jsonb;
  v_stops jsonb;
  v_students jsonb;
  v_shape jsonb;
  v_location jsonb;
  v_eta jsonb;
begin
  if auth.uid() is null or v_tenant is null or v_role is null
    or v_role not in ('tenant_admin','school_admin','transportation_admin')
    or not coalesce(public.is_current_user_session_active(),false)
    or not coalesce(safebus_private.has_verified_mfa(),false)
    or (v_role='school_admin' and safebus_private.current_school_id() is null) then
    raise exception 'An authorized administrator with MFA is required.' using errcode = '42501';
  end if;
  select dt.*,rtp.direction,r.route_name,r.route_code,r.map_color,
    coalesce(dt.trip_name_snapshot,rtp.display_name) as pattern_label,
    coalesce(dt.bus_number_snapshot,b.bus_number) as bus_label,p.full_name as driver_label
  into v_trip from public.driver_trips dt
  join public.routes r on r.id=dt.route_id and r.tenant_id=dt.tenant_id
  join public.route_trip_patterns rtp on rtp.id=dt.route_trip_pattern_id and rtp.route_id=dt.route_id and rtp.tenant_id=dt.tenant_id
  join public.buses b on b.id=dt.bus_id and b.tenant_id=dt.tenant_id
  join public.drivers d on d.id=dt.driver_id and d.tenant_id=dt.tenant_id
  join public.profiles p on p.id=d.profile_id and p.tenant_id=dt.tenant_id
  where dt.id=p_trip_id and dt.tenant_id=v_tenant
    and (v_role <> 'school_admin' or r.school_id=safebus_private.current_school_id());
  if not found then return null; end if;
  v_summary := jsonb_build_object('trip_id',v_trip.id,'service_date',v_trip.service_date,
    'status',v_trip.status,'started_at',v_trip.started_at,'ended_at',v_trip.ended_at,
    'route_name',v_trip.route_name,'route_code',v_trip.route_code,'trip_pattern_name',v_trip.pattern_label,
    'direction',v_trip.direction,'bus_label',v_trip.bus_label,'driver_label',v_trip.driver_label);
  select coalesce(jsonb_agg(jsonb_build_object('id',rs.id,'name',rs.stop_name,'order',rs.stop_order,
    'latitude',rs.latitude,'longitude',rs.longitude,'plannedTime',rtss.planned_arrival_time)
    order by case when v_trip.direction='forward' then rs.stop_order end asc,
      case when v_trip.direction='reverse' then rs.stop_order end desc,rs.id),'[]'::jsonb)
  into v_stops from public.route_stops rs
  left join public.route_trip_stop_schedules rtss on rtss.route_stop_id=rs.id
    and rtss.route_trip_pattern_id=v_trip.route_trip_pattern_id and rtss.tenant_id=v_tenant
    and rtss.route_id=v_trip.route_id
  where rs.route_id=v_trip.route_id and rs.tenant_id=v_tenant and rs.status='active';
  select jsonb_build_object('geojson',extensions.st_asgeojson(sh.path)::jsonb,
    'version',sh.version,'basis',case when sh.id=v_trip.route_shape_id then 'trip' else 'current' end)
  into v_shape from public.route_shapes sh where sh.tenant_id=v_tenant and sh.route_id=v_trip.route_id
    and (sh.id=v_trip.route_shape_id or (v_trip.route_shape_id is null and sh.status='published'))
  order by sh.version desc limit 1;
  -- No location/history is returned for a completed or cancelled trip.
  if v_trip.status in ('active','paused') then
    select jsonb_build_object('latitude',loc.latitude,'longitude',loc.longitude,
      'recordedAt',loc.recorded_at,'speedMps',loc.speed_mps,'accuracyM',loc.accuracy_m,
      'state',case when loc.recorded_at > now()+interval '30 seconds' then 'invalid'
        when loc.recorded_at < now()-interval '2 minutes' then 'stale' else 'live' end)
    into v_location from public.driver_trip_current_locations loc
    where loc.driver_trip_id=v_trip.id and loc.tenant_id=v_tenant and loc.driver_id=v_trip.driver_id
      and loc.bus_id=v_trip.bus_id and loc.route_id=v_trip.route_id;
  end if;
  if v_trip.status='active' and v_location->>'state'='live' then
    select jsonb_build_object('label',eta.eta_label,'nextStop',eta.next_stop_name)
    into v_eta from (
      select rs.id from public.route_stops rs where rs.route_id=v_trip.route_id and rs.tenant_id=v_tenant and rs.status='active'
      order by case when v_trip.direction='forward' then rs.stop_order end desc,
        case when v_trip.direction='reverse' then rs.stop_order end asc,rs.id limit 1
    ) target cross join lateral safebus_private.calculate_safe_route_eta(v_trip.route_id,target.id,
      v_trip.route_trip_pattern_id,(v_location->>'latitude')::double precision,(v_location->>'longitude')::double precision,
      (v_location->>'speedMps')::double precision,(v_location->>'recordedAt')::timestamptz) eta;
  end if;
  with assignments as (
    select distinct on (sba.student_id) sba.student_id,sba.pickup_stop_id,sba.dropoff_stop_id,
      sba.seat_number,sba.status
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra on bra.id=sba.bus_route_assignment_id and bra.tenant_id=sba.tenant_id
      and bra.bus_id=v_trip.bus_id and bra.route_id=v_trip.route_id
      and bra.route_trip_pattern_id=v_trip.route_trip_pattern_id
      and (bra.effective_from is null or bra.effective_from<=v_trip.service_date)
      and (bra.effective_to is null or bra.effective_to>=v_trip.service_date)
    where sba.tenant_id=v_tenant and sba.route_trip_pattern_id=v_trip.route_trip_pattern_id
      and sba.effective_from<=v_trip.service_date and (sba.effective_to is null or sba.effective_to>=v_trip.service_date)
      and (v_trip.status in ('completed','cancelled') or (sba.status='active' and bra.status='active'))
    order by sba.student_id,sba.effective_from desc,sba.created_at desc,sba.id
  ), events as (
    select e.student_id,max(e.event_time) filter(where e.event_type='picked_up') as picked_up_at,
      max(e.event_time) filter(where e.event_type='dropped_off') as dropped_off_at
    from public.student_trip_events e where e.driver_trip_id=v_trip.id and e.tenant_id=v_tenant
    group by e.student_id
  ), roster as (select student_id from assignments union select student_id from events)
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',concat_ws(' ',s.first_name,s.last_name),
    'school',sc.name,'pickupStop',ps.stop_name,'dropoffStop',ds.stop_name,'seat',a.seat_number,
    'hasAssignment',a.student_id is not null,'assignmentStatus',a.status,
    'pickedUpAt',e.picked_up_at,'droppedOffAt',e.dropped_off_at)
    order by s.last_name,s.first_name,s.id),'[]'::jsonb) into v_students
  from roster x join public.students s on s.id=x.student_id and s.tenant_id=v_tenant
  left join assignments a on a.student_id=s.id left join events e on e.student_id=s.id
  left join public.schools sc on sc.id=s.school_id and sc.tenant_id=v_tenant
  left join public.route_stops ps on ps.id=a.pickup_stop_id and ps.tenant_id=v_tenant and ps.route_id=v_trip.route_id
  left join public.route_stops ds on ds.id=a.dropoff_stop_id and ds.tenant_id=v_tenant and ds.route_id=v_trip.route_id
  where v_role <> 'school_admin' or s.school_id=safebus_private.current_school_id();
  return jsonb_build_object('trip',v_summary,'stops',v_stops,'shape',v_shape,'location',v_location,
    'students',v_students,'mapColor',v_trip.map_color,'eta',v_eta);
end;
$$;

revoke all on function public.get_admin_trip_operations(date,date,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_trip_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_trip_operations(date,date,text,integer,integer) to authenticated;
grant execute on function public.get_admin_trip_detail(uuid) to authenticated;
