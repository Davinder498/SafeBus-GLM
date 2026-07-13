-- SafeBus Alberta - Phase 14 safe ETA foundation
--
-- Adds server-side conservative ETA helpers and extends the existing guardian
-- and tenant-admin live monitoring RPCs. No table RLS policies are broadened.

create or replace function public.safebus_distance_meters(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 6371000.0 * 2.0 * asin(
    least(1.0, sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2.0)), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians((p_lng2 - p_lng1) / 2.0)), 2)
    ))
  );
$$;

create or replace function public.calculate_safe_route_eta(
  p_route_id uuid,
  p_target_stop_id uuid,
  p_trip_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_speed_mps double precision,
  p_recorded_at timestamptz
)
returns table (
  eta_status text,
  eta_min_minutes integer,
  eta_max_minutes integer,
  eta_label text,
  target_stop_name text,
  target_stop_order integer,
  next_stop_name text,
  next_stop_order integer,
  progress_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with params as (
    select
      case when p_trip_type = 'evening' then 'desc' else 'asc' end as direction,
      case
        when p_speed_mps is not null and p_speed_mps between 3 and 15 then p_speed_mps
        else 8.0
      end as safe_speed_mps
  ), target as (
    select rs.id, rs.stop_name, rs.stop_order, rs.latitude::double precision as latitude, rs.longitude::double precision as longitude
    from public.route_stops rs
    where rs.id = p_target_stop_id
      and rs.route_id = p_route_id
      and rs.status = 'active'
      and rs.latitude is not null
      and rs.longitude is not null
  ), route_points as (
    select rs.id, rs.stop_name, rs.stop_order, rs.latitude::double precision as latitude, rs.longitude::double precision as longitude
    from public.route_stops rs
    where rs.route_id = p_route_id
      and rs.status = 'active'
      and rs.latitude is not null
      and rs.longitude is not null
  ), nearest as (
    select rp.*,
      public.safebus_distance_meters(p_latitude, p_longitude, rp.latitude, rp.longitude) as distance_m
    from route_points rp
    order by distance_m asc, rp.stop_order asc
    limit 1
  ), progress as (
    select
      n.*,
      t.stop_name as target_name,
      t.stop_order as target_order,
      t.latitude as target_latitude,
      t.longitude as target_longitude,
      p.direction,
      p.safe_speed_mps,
      case
        when p_recorded_at is null then 'missing_location'
        when p_recorded_at < now() - interval '2 minutes' then 'stale_location'
        when p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then 'invalid_location'
        when t.id is null then 'missing_stop_coordinates'
        when n.id is null then 'missing_route_coordinates'
        when p.direction = 'asc' and t.stop_order < n.stop_order then 'passed_stop'
        when p.direction = 'desc' and t.stop_order > n.stop_order then 'passed_stop'
        else 'calculable'
      end as status
    from params p
    left join nearest n on true
    left join target t on true
  ), next_stop as (
    select rp.*
    from progress pr
    join route_points rp on true
    where pr.status = 'calculable'
      and (
        (pr.direction = 'asc' and rp.stop_order >= pr.stop_order and rp.stop_order <= pr.target_order)
        or (pr.direction = 'desc' and rp.stop_order <= pr.stop_order and rp.stop_order >= pr.target_order)
      )
    order by
      case when pr.direction = 'asc' then rp.stop_order end asc,
      case when pr.direction = 'desc' then rp.stop_order end desc
    limit 1
  ), segments as (
    select
      rp.stop_order,
      rp.latitude,
      rp.longitude,
      lead(rp.latitude) over (order by case when pr.direction = 'asc' then rp.stop_order else -rp.stop_order end) as next_latitude,
      lead(rp.longitude) over (order by case when pr.direction = 'asc' then rp.stop_order else -rp.stop_order end) as next_longitude
    from progress pr
    join route_points rp on (
      (pr.direction = 'asc' and rp.stop_order between pr.stop_order and pr.target_order)
      or (pr.direction = 'desc' and rp.stop_order between pr.target_order and pr.stop_order)
    )
    where pr.status = 'calculable'
  ), distance_calc as (
    select
      coalesce(public.safebus_distance_meters(p_latitude, p_longitude, ns.latitude, ns.longitude), 0) +
      coalesce(sum(public.safebus_distance_meters(s.latitude, s.longitude, s.next_latitude, s.next_longitude)) filter (where s.next_latitude is not null), 0) as meters
    from next_stop ns
    left join segments s on true
  ), eta as (
    select pr.*, ns.stop_name as next_name, ns.stop_order as next_order,
      ceil(greatest(1, dc.meters / pr.safe_speed_mps / 60.0))::integer as min_minutes
    from progress pr
    left join next_stop ns on true
    left join distance_calc dc on true
  )
  select
    case
      when eta.status <> 'calculable' then eta.status
      when eta.min_minutes > 90 then 'too_far'
      else 'available'
    end,
    case when eta.status = 'calculable' and eta.min_minutes <= 90 then eta.min_minutes else null end,
    case when eta.status = 'calculable' and eta.min_minutes <= 90 then least(90, eta.min_minutes + greatest(3, ceil(eta.min_minutes * 0.35)::integer)) else null end,
    case
      when eta.status <> 'calculable' then 'ETA temporarily unavailable'
      when eta.min_minutes > 90 then 'ETA temporarily unavailable'
      when eta.min_minutes <= 3 then 'Arriving soon'
      when eta.min_minutes <= 10 then 'About ' || eta.min_minutes::text || ' minutes away'
      else 'About ' || eta.min_minutes::text || '–' || least(90, eta.min_minutes + greatest(3, ceil(eta.min_minutes * 0.35)::integer))::text || ' minutes away'
    end,
    eta.target_name,
    eta.target_order,
    eta.next_name,
    eta.next_order,
    case
      when eta.status = 'passed_stop' then 'Relevant stop already passed'
      when eta.status = 'missing_stop_coordinates' then 'Stop coordinates needed'
      when eta.status = 'missing_route_coordinates' then 'Route stop coordinates needed'
      when eta.status in ('missing_location','stale_location','invalid_location') then 'Bus location delayed'
      when eta.status = 'calculable' then 'Next stop: ' || coalesce(eta.next_name, eta.target_name)
      else 'ETA temporarily unavailable'
    end
  from eta;
$$;

-- Guardian RPC: adds safe ETA fields while preserving guardian authorization.
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
  select s.id, (s.first_name || ' ' || s.last_name), r.id, r.route_name,
    ps.stop_name, ds.stop_name,
    case when t.trip_type = 'evening' then ds.stop_name else ps.stop_name end,
    t.status, (t.id is not null), loc.latitude, loc.longitude, loc.recorded_at,
    case when t.id is null then 'waiting_for_trip' else eta.eta_status end,
    eta.eta_min_minutes, eta.eta_max_minutes,
    case when t.id is null then 'Waiting for the trip to start' else eta.eta_label end,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.students s
  join public.student_guardians sg on sg.student_id = s.id and sg.guardian_id = public.current_guardian_id() and sg.status = 'active' and sg.tenant_id = s.tenant_id
  join public.student_route_assignments sra on sra.student_id = s.id and sra.status = 'active' and sra.tenant_id = s.tenant_id
  join public.routes r on r.id = sra.route_id and r.tenant_id = s.tenant_id
  left join public.route_stops ps on ps.id = sra.pickup_stop_id and ps.tenant_id = s.tenant_id and ps.route_id = r.id and ps.status = 'active'
  left join public.route_stops ds on ds.id = sra.dropoff_stop_id and ds.tenant_id = s.tenant_id and ds.route_id = r.id and ds.status = 'active'
  left join lateral (
    select dt.id, dt.status, dt.started_at, dt.bus_id, dt.route_id, dt.driver_id, dt.trip_type
    from public.driver_trips dt
    join public.buses b on b.id = dt.bus_id and b.tenant_id = s.tenant_id and b.status = 'active'
    join public.drivers d on d.id = dt.driver_id and d.tenant_id = s.tenant_id and d.status = 'active'
    where dt.route_id = r.id and dt.tenant_id = s.tenant_id and dt.status = 'active'
    order by dt.started_at desc limit 1
  ) t on true
  left join public.driver_trip_current_locations loc on loc.driver_trip_id = t.id and loc.tenant_id = s.tenant_id and loc.route_id = r.id and loc.bus_id = t.bus_id and loc.driver_id = t.driver_id
  left join lateral public.calculate_safe_route_eta(r.id, case when t.trip_type = 'evening' then sra.dropoff_stop_id else sra.pickup_stop_id end, t.trip_type, loc.latitude, loc.longitude, loc.speed_mps, loc.recorded_at) eta on t.id is not null
  where s.status = 'active' and s.tenant_id = public.current_tenant_id() and auth.uid() is not null and public.current_user_role() = 'guardian' and public.current_guardian_id() is not null and public.current_tenant_id() is not null
  order by s.last_name, s.first_name, r.route_name;
$$;

revoke all on function public.get_guardian_live_trip_visibility() from public;
revoke all on function public.get_guardian_live_trip_visibility() from anon;
grant execute on function public.get_guardian_live_trip_visibility() to authenticated;

-- Admin RPC: adds next stop / ETA status without exposing guardian/student data.
create or replace function public.get_admin_live_fleet_monitoring()
returns table (
  bus_label text,
  route_name text,
  driver_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz,
  speed_mps double precision,
  location_status text,
  issue_label text,
  next_stop_name text,
  eta_status text,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.bus_number, r.route_name, p.full_name, dt.trip_type, dt.status, dt.started_at,
    loc.latitude, loc.longitude, loc.recorded_at, loc.speed_mps,
    case when loc.recorded_at is null then 'missing' when loc.recorded_at < now() - interval '2 minutes' then 'stale' else 'live' end,
    case when loc.recorded_at is null then 'Missing GPS' when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS' when eta.eta_status is distinct from 'available' then 'Needs attention' when loc.speed_mps is null then 'Speed unavailable' else 'OK' end,
    eta.next_stop_name,
    eta.eta_status,
    eta.eta_label,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.driver_trips dt
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join public.driver_trip_current_locations loc on loc.driver_trip_id = dt.id and loc.tenant_id = dt.tenant_id and loc.driver_id = dt.driver_id and loc.bus_id = dt.bus_id and loc.route_id = dt.route_id
  left join lateral (
    select rs.id from public.route_stops rs
    where rs.route_id = dt.route_id and rs.status = 'active'
    order by case when dt.trip_type = 'evening' then -rs.stop_order else rs.stop_order end
    limit 1
  ) target on true
  left join lateral public.calculate_safe_route_eta(dt.route_id, target.id, dt.trip_type, loc.latitude, loc.longitude, loc.speed_mps, loc.recorded_at) eta on true
  where dt.status = 'active' and auth.uid() is not null and dt.tenant_id = public.current_tenant_id() and public.current_user_role() in ('platform_super_admin','tenant_admin','school_admin','transportation_admin')
  order by case when loc.recorded_at is null then 0 when loc.recorded_at < now() - interval '2 minutes' then 1 else 2 end, dt.started_at desc;
$$;

revoke all on function public.get_admin_live_fleet_monitoring() from public;
revoke all on function public.get_admin_live_fleet_monitoring() from anon;
grant execute on function public.get_admin_live_fleet_monitoring() to authenticated;
