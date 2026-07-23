-- SafeBus Alberta - PostGIS spatial foundation
-- Foundation only: additive spatial points, indexes, secure admin viewport RPC,
-- and a tenant-safe bus-to-stop distance helper. Existing latitude/longitude
-- contracts remain unchanged; PostGIS point construction always uses
-- longitude, latitude order.

create extension if not exists postgis with schema extensions;

alter table public.driver_trip_current_locations
  add column if not exists location_geog extensions.geography(Point, 4326)
  generated always as (
    case
      when latitude is not null
        and longitude is not null
        and latitude between -90 and 90
        and longitude between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
      else null
    end
  ) stored;

alter table public.route_stops
  add column if not exists location_geog extensions.geography(Point, 4326)
  generated always as (
    case
      when latitude is not null
        and longitude is not null
        and latitude between -90 and 90
        and longitude between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
      else null
    end
  ) stored;

alter table public.schools
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

alter table public.schools
  drop constraint if exists schools_latitude_check,
  add constraint schools_latitude_check check (latitude is null or latitude between -90 and 90),
  drop constraint if exists schools_longitude_check,
  add constraint schools_longitude_check check (longitude is null or longitude between -180 and 180);

alter table public.schools
  add column if not exists location_geog extensions.geography(Point, 4326)
  generated always as (
    case
      when latitude is not null
        and longitude is not null
        and latitude between -90 and 90
        and longitude between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
      else null
    end
  ) stored;

create index if not exists driver_trip_current_locations_location_geog_gist_idx
  on public.driver_trip_current_locations using gist(location_geog)
  where location_geog is not null;

create index if not exists route_stops_location_geog_gist_idx
  on public.route_stops using gist(location_geog)
  where location_geog is not null;

create index if not exists schools_location_geog_gist_idx
  on public.schools using gist(location_geog)
  where location_geog is not null;

create or replace function public.validate_spatial_viewport_bounds(
  p_south_latitude double precision,
  p_west_longitude double precision,
  p_north_latitude double precision,
  p_east_longitude double precision
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if public.current_tenant_id() is null or public.current_user_role() not in ('tenant_admin','school_admin','transportation_admin') then
    raise exception 'Admin live viewport access denied.' using errcode = '42501';
  end if;

  if p_south_latitude is null or p_west_longitude is null or p_north_latitude is null or p_east_longitude is null then
    raise exception 'Viewport bounds are required.' using errcode = '22023';
  end if;

  if p_south_latitude <> p_south_latitude or p_west_longitude <> p_west_longitude or p_north_latitude <> p_north_latitude or p_east_longitude <> p_east_longitude then
    raise exception 'Viewport bounds must be finite numbers.' using errcode = '22023';
  end if;

  if p_south_latitude < -90 or p_south_latitude > 90 or p_north_latitude < -90 or p_north_latitude > 90 then
    raise exception 'Viewport latitude bounds must be between -90 and 90.' using errcode = '22023';
  end if;

  if p_west_longitude < -180 or p_west_longitude > 180 or p_east_longitude < -180 or p_east_longitude > 180 then
    raise exception 'Viewport longitude bounds must be between -180 and 180.' using errcode = '22023';
  end if;

  if p_south_latitude > p_north_latitude then
    raise exception 'Viewport south latitude must be less than or equal to north latitude.' using errcode = '22023';
  end if;

  if p_west_longitude > p_east_longitude then
    raise exception 'Viewports crossing the antimeridian are not supported yet.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validate_spatial_viewport_bounds(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.validate_spatial_viewport_bounds(double precision, double precision, double precision, double precision) to authenticated;


create or replace function public.update_driver_trip_location(
  p_driver_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null,
  p_source text default 'browser'
)
returns public.driver_trip_current_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.driver_trips;
  v_current public.driver_trip_current_locations;
  v_source text := coalesce(p_source, 'browser');
begin
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can update trip location.' using errcode = '42501';
  end if;

  if p_latitude is null or p_longitude is null or p_latitude <> p_latitude or p_longitude <> p_longitude then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;
  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'Invalid latitude.' using errcode = '22023';
  end if;
  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid longitude.' using errcode = '22023';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m <> p_accuracy_m or p_accuracy_m < 0) then
    raise exception 'Invalid location accuracy.' using errcode = '22023';
  end if;
  if p_heading_deg is not null and (p_heading_deg <> p_heading_deg or p_heading_deg < 0 or p_heading_deg > 360) then
    raise exception 'Invalid heading.' using errcode = '22023';
  end if;
  if p_speed_mps is not null and (p_speed_mps <> p_speed_mps or p_speed_mps < 0) then
    raise exception 'Invalid speed.' using errcode = '22023';
  end if;

  select * into v_trip from public.driver_trips where id = p_driver_trip_id for update;
  if not found then raise exception 'Trip not found.' using errcode = 'P0002'; end if;
  if v_trip.tenant_id is distinct from public.current_tenant_id() then raise exception 'Trip not found.' using errcode = 'P0002'; end if;
  if v_trip.driver_id is distinct from public.current_driver_id() then raise exception 'Trip not found.' using errcode = 'P0002'; end if;
  if v_trip.status <> 'active' then raise exception 'Cannot update location for a trip that is not active.' using errcode = '55006'; end if;
  if v_source not in ('browser', 'manual') then v_source := 'browser'; end if;

  insert into public.driver_trip_location_updates (tenant_id, driver_trip_id, driver_id, bus_id, route_id, latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at)
  values (v_trip.tenant_id, v_trip.id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id, p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps, v_source, now());

  insert into public.driver_trip_current_locations (driver_trip_id, tenant_id, driver_id, bus_id, route_id, latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at, updated_at)
  values (v_trip.id, v_trip.tenant_id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id, p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps, v_source, now(), now())
  on conflict (driver_trip_id) do update set
    latitude = excluded.latitude, longitude = excluded.longitude, accuracy_m = excluded.accuracy_m,
    heading_deg = excluded.heading_deg, speed_mps = excluded.speed_mps, source = excluded.source,
    recorded_at = excluded.recorded_at, updated_at = now()
  returning * into v_current;

  return v_current;
end;
$$;

comment on function public.update_driver_trip_location(uuid, double precision, double precision, double precision, double precision, double precision, text) is
  'Secure driver GPS update path with explicit coordinate/range validation. Preserves ordinary latitude/longitude inputs and derives tenant/driver/bus/route from the active trip.';

create or replace function public.get_admin_live_fleet_monitoring_in_viewport(
  p_south_latitude double precision,
  p_west_longitude double precision,
  p_north_latitude double precision,
  p_east_longitude double precision
)
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
stable
security definer
set search_path = public, pg_temp
as $$
  with authorized as (
    select public.validate_spatial_viewport_bounds(p_south_latitude, p_west_longitude, p_north_latitude, p_east_longitude)
  ), viewport as (
    select extensions.st_makeenvelope(p_west_longitude, p_south_latitude, p_east_longitude, p_north_latitude, 4326)::extensions.geography as geog
    from authorized
  )
  select b.bus_number, r.route_name, p.full_name, dt.trip_type, dt.status, dt.started_at,
    loc.latitude, loc.longitude, loc.recorded_at, loc.speed_mps,
    case when loc.recorded_at is null then 'missing' when loc.recorded_at < now() - interval '2 minutes' then 'stale' else 'live' end,
    case when loc.recorded_at is null then 'Missing GPS' when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS' when eta.eta_status is distinct from 'available' then 'Needs attention' when loc.speed_mps is null then 'Speed unavailable' else 'OK' end,
    eta.next_stop_name, eta.eta_status, eta.eta_label,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from viewport v
  join public.driver_trip_current_locations loc on loc.location_geog is not null and extensions.st_intersects(loc.location_geog, v.geog)
  join public.driver_trips dt on dt.id = loc.driver_trip_id and dt.tenant_id = loc.tenant_id and dt.driver_id = loc.driver_id and dt.bus_id = loc.bus_id and dt.route_id = loc.route_id
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join lateral (
    select rs.id from public.route_stops rs
    where rs.route_id = dt.route_id and rs.status = 'active'
    order by case when dt.trip_type = 'evening' then -rs.stop_order else rs.stop_order end
    limit 1
  ) target on true
  left join lateral public.calculate_safe_route_eta(dt.route_id, target.id, dt.route_trip_pattern_id, loc.latitude, loc.longitude, loc.speed_mps, loc.recorded_at) eta on true
  where dt.status = 'active'
    and dt.tenant_id = public.current_tenant_id()
  order by case when loc.recorded_at < now() - interval '2 minutes' then 1 else 2 end, dt.started_at desc;
$$;

revoke all on function public.get_admin_live_fleet_monitoring_in_viewport(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.get_admin_live_fleet_monitoring_in_viewport(double precision, double precision, double precision, double precision) to authenticated;

comment on function public.get_admin_live_fleet_monitoring_in_viewport(double precision, double precision, double precision, double precision) is
  'Tenant-scoped admin live fleet monitoring filtered in PostgreSQL by a PostGIS geography viewport. Ordinary latitude/longitude values are returned; client tenant ids are not accepted. Antimeridian-crossing viewports are rejected.';

create or replace function public.get_admin_live_trip_stop_distance_metres(
  p_driver_trip_id uuid,
  p_route_stop_id uuid
)
returns double precision
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select extensions.st_distance(loc.location_geog, rs.location_geog)
  from public.driver_trips dt
  join public.driver_trip_current_locations loc
    on loc.driver_trip_id = dt.id
    and loc.tenant_id = dt.tenant_id
    and loc.driver_id = dt.driver_id
    and loc.bus_id = dt.bus_id
    and loc.route_id = dt.route_id
  join public.route_stops rs
    on rs.id = p_route_stop_id
    and rs.tenant_id = dt.tenant_id
    and rs.route_id = dt.route_id
    and rs.status = 'active'
  where auth.uid() is not null
    and public.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
    and dt.tenant_id = public.current_tenant_id()
    and dt.id = p_driver_trip_id
    and dt.status = 'active'
    and loc.location_geog is not null
    and rs.location_geog is not null;
$$;

revoke all on function public.get_admin_live_trip_stop_distance_metres(uuid, uuid) from public, anon;
grant execute on function public.get_admin_live_trip_stop_distance_metres(uuid, uuid) to authenticated;

comment on function public.get_admin_live_trip_stop_distance_metres(uuid, uuid) is
  'Admin-only tenant-scoped foundation helper returning PostGIS distance in metres between an active trip latest location and an active route stop on the same route.';
