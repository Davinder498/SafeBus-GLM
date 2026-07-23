-- SafeBus Alberta - versioned route geometry foundation
-- Adds tenant-isolated PostGIS LineString route shapes. GeoJSON coordinates are
-- always longitude, latitude. Authoritative path storage is geometry(LineString,
-- 4326); distance calculations cast that geometry to geography for metres.

alter table public.routes
  add constraint routes_id_tenant_unique unique (id, tenant_id);

create table public.route_shapes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete restrict,
  version integer not null,
  path extensions.geometry(LineString, 4326) not null,
  distance_meters double precision not null,
  status text not null default 'draft',
  source text not null default 'admin_geojson',
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_shapes_version_check check (version > 0),
  constraint route_shapes_distance_check check (distance_meters > 0),
  constraint route_shapes_status_check check (status in ('draft', 'published', 'archived')),
  constraint route_shapes_source_check check (source in ('admin_geojson', 'import', 'system')),
  constraint route_shapes_effective_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint route_shapes_route_version_unique unique (route_id, version),
  constraint route_shapes_route_tenant_fk foreign key (route_id, tenant_id) references public.routes(id, tenant_id) on delete restrict
);

alter table public.driver_trips
  add column route_shape_id uuid references public.route_shapes(id) on delete set null;

alter table public.route_shapes
  add constraint route_shapes_id_tenant_unique unique (id, tenant_id);

create index route_shapes_tenant_id_idx on public.route_shapes(tenant_id);
create index route_shapes_route_id_idx on public.route_shapes(route_id);
create index route_shapes_route_status_idx on public.route_shapes(route_id, status, version desc);
create unique index route_shapes_one_current_published_idx
  on public.route_shapes(route_id)
  where status = 'published' and effective_to is null;
create index route_shapes_path_gist_idx on public.route_shapes using gist(path);
create index driver_trips_route_shape_id_idx on public.driver_trips(route_shape_id);

create trigger set_updated_at_route_shapes
  before update on public.route_shapes
  for each row execute function public.set_updated_at();

alter table public.route_shapes enable row level security;

grant select on table public.route_shapes to authenticated;
revoke insert, update, delete on table public.route_shapes from authenticated;

create policy "route_shapes select platform admin"
  on public.route_shapes for select to authenticated
  using (public.is_platform_super_admin());
create policy "route_shapes select tenant admin"
  on public.route_shapes for select to authenticated
  using (public.is_tenant_admin() and tenant_id = public.current_tenant_id());
create policy "route_shapes select school or transportation admin"
  on public.route_shapes for select to authenticated
  using (public.is_school_or_transportation_admin() and tenant_id = public.current_tenant_id());
create policy "route_shapes select assigned driver published"
  on public.route_shapes for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and status = 'published'
    and exists (
      select 1 from public.driver_trips dt
      where dt.route_shape_id = route_shapes.id
        and dt.tenant_id = route_shapes.tenant_id
        and dt.driver_id = public.current_driver_id()
        and dt.status = 'active'
    )
  );

create or replace function public.require_route_shape_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null or public.current_user_role() not in ('tenant_admin','school_admin','transportation_admin') then
    raise exception 'Route shape administration requires an authorized admin.' using errcode = '42501';
  end if;
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'Route shape administration requires a tenant context.' using errcode = '42501';
  end if;
  return v_tenant_id;
end;
$$;

create or replace function public.validate_route_shape_geojson(p_geojson jsonb)
returns extensions.geometry(LineString, 4326)
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_geom extensions.geometry(LineString, 4326);
  v_distinct_points integer;
  v_distance double precision;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' then
    raise exception 'Route shape must be valid GeoJSON LineString.' using errcode = '22023';
  end if;
  if p_geojson->>'type' <> 'LineString' then
    raise exception 'Route shape must be a GeoJSON LineString.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_geojson->'coordinates') <> 'array' or jsonb_array_length(p_geojson->'coordinates') < 2 then
    raise exception 'Route shape must contain at least two coordinates.' using errcode = '22023';
  end if;

  begin
    v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)::extensions.geometry(LineString, 4326);
  exception when others then
    raise exception 'Route shape must be valid GeoJSON LineString.' using errcode = '22023';
  end;

  if extensions.st_isempty(v_geom) or extensions.st_srid(v_geom) <> 4326 then
    raise exception 'Route shape must use SRID 4326 and cannot be empty.' using errcode = '22023';
  end if;
  if exists (
    select 1 from extensions.st_dumppoints(v_geom) p
    where extensions.st_x(p.geom) <> extensions.st_x(p.geom)
       or extensions.st_y(p.geom) <> extensions.st_y(p.geom)
       or extensions.st_x(p.geom) < -180 or extensions.st_x(p.geom) > 180
       or extensions.st_y(p.geom) < -90 or extensions.st_y(p.geom) > 90
  ) then
    raise exception 'Route shape coordinates must be finite longitude, latitude pairs in valid ranges.' using errcode = '22023';
  end if;
  select count(distinct (round(extensions.st_x(p.geom)::numeric, 7), round(extensions.st_y(p.geom)::numeric, 7))) into v_distinct_points
  from extensions.st_dumppoints(v_geom) p;
  if v_distinct_points < 2 then
    raise exception 'Route shape must contain at least two distinct points.' using errcode = '22023';
  end if;
  v_distance := extensions.st_length(v_geom::extensions.geography);
  if v_distance < 1 then
    raise exception 'Route shape length is too short.' using errcode = '22023';
  end if;
  return v_geom;
end;
$$;

create or replace function public.admin_create_route_shape_version(p_route_id uuid, p_geojson jsonb, p_status text default 'draft', p_source text default 'admin_geojson')
returns table (id uuid, route_id uuid, version integer, status text, distance_meters double precision, geojson jsonb, effective_from timestamptz, effective_to timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.require_route_shape_admin();
  v_route public.routes;
  v_geom extensions.geometry(LineString, 4326);
  v_version integer;
  v_shape public.route_shapes;
begin
  if p_status not in ('draft','published') then raise exception 'Route shape status must be draft or published.' using errcode = '22023'; end if;
  if coalesce(p_source, 'admin_geojson') not in ('admin_geojson','import','system') then raise exception 'Route shape source is invalid.' using errcode = '22023'; end if;
  select * into v_route from public.routes where id = p_route_id and tenant_id = v_tenant_id and status <> 'archived' for update;
  if not found then raise exception 'Route not found.' using errcode = 'P0002'; end if;
  v_geom := public.validate_route_shape_geojson(p_geojson);
  select coalesce(max(rs.version), 0) + 1 into v_version from public.route_shapes rs where rs.route_id = p_route_id;
  insert into public.route_shapes (tenant_id, route_id, version, path, distance_meters, status, source, effective_from, created_by)
  values (v_tenant_id, p_route_id, v_version, v_geom, extensions.st_length(v_geom::extensions.geography), p_status, coalesce(p_source, 'admin_geojson'), case when p_status = 'published' then now() else null end, auth.uid())
  returning * into v_shape;
  if p_status = 'published' then
    update public.route_shapes set status = 'archived', effective_to = now() where route_id = p_route_id and id <> v_shape.id and status = 'published' and effective_to is null;
  end if;
  return query select v_shape.id, v_shape.route_id, v_shape.version, v_shape.status, v_shape.distance_meters, extensions.st_asgeojson(v_shape.path)::jsonb, v_shape.effective_from, v_shape.effective_to, v_shape.created_at;
end;
$$;

create or replace function public.admin_publish_route_shape_version(p_route_shape_id uuid)
returns table (id uuid, route_id uuid, version integer, status text, distance_meters double precision, geojson jsonb, effective_from timestamptz, effective_to timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant_id uuid := public.require_route_shape_admin(); v_shape public.route_shapes;
begin
  select * into v_shape from public.route_shapes where id = p_route_shape_id and tenant_id = v_tenant_id for update;
  if not found then raise exception 'Route shape not found.' using errcode = 'P0002'; end if;
  update public.route_shapes set status = 'archived', effective_to = now() where route_id = v_shape.route_id and id <> v_shape.id and status = 'published' and effective_to is null;
  update public.route_shapes set status = 'published', effective_from = coalesce(effective_from, now()), effective_to = null where id = v_shape.id returning * into v_shape;
  return query select v_shape.id, v_shape.route_id, v_shape.version, v_shape.status, v_shape.distance_meters, extensions.st_asgeojson(v_shape.path)::jsonb, v_shape.effective_from, v_shape.effective_to, v_shape.created_at;
end;
$$;

create or replace function public.get_admin_route_shape_versions(p_route_id uuid)
returns table (id uuid, route_id uuid, version integer, status text, distance_meters double precision, geojson jsonb, effective_from timestamptz, effective_to timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rs.id, rs.route_id, rs.version, rs.status, rs.distance_meters, extensions.st_asgeojson(rs.path)::jsonb, rs.effective_from, rs.effective_to, rs.created_at
  from public.route_shapes rs
  where rs.route_id = p_route_id and rs.tenant_id = public.require_route_shape_admin()
  order by rs.version desc;
$$;

create or replace function public.get_current_route_shape(p_route_id uuid)
returns table (id uuid, route_id uuid, version integer, status text, distance_meters double precision, geojson jsonb, effective_from timestamptz, effective_to timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rs.id, rs.route_id, rs.version, rs.status, rs.distance_meters, extensions.st_asgeojson(rs.path)::jsonb, rs.effective_from, rs.effective_to
  from public.route_shapes rs
  where rs.route_id = p_route_id and rs.tenant_id = public.current_tenant_id() and rs.status = 'published' and rs.effective_to is null
    and auth.uid() is not null and public.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
  order by rs.version desc limit 1;
$$;

create or replace function public.get_driver_active_trip_route_shape()
returns table (driver_trip_id uuid, route_shape_id uuid, route_id uuid, version integer, distance_meters double precision, geojson jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dt.id, rs.id, rs.route_id, rs.version, rs.distance_meters, extensions.st_asgeojson(rs.path)::jsonb
  from public.driver_trips dt
  join public.route_shapes rs on rs.id = dt.route_shape_id and rs.tenant_id = dt.tenant_id
  where auth.uid() is not null and public.current_user_role() = 'driver'
    and dt.tenant_id = public.current_tenant_id() and dt.driver_id = public.current_driver_id() and dt.status = 'active';
$$;

revoke all on function public.require_route_shape_admin() from public, anon;
revoke all on function public.validate_route_shape_geojson(jsonb) from public, anon;
revoke all on function public.admin_create_route_shape_version(uuid, jsonb, text, text) from public, anon;
revoke all on function public.admin_publish_route_shape_version(uuid) from public, anon;
revoke all on function public.get_admin_route_shape_versions(uuid) from public, anon;
revoke all on function public.get_current_route_shape(uuid) from public, anon;
revoke all on function public.get_driver_active_trip_route_shape() from public, anon;
grant execute on function public.admin_create_route_shape_version(uuid, jsonb, text, text) to authenticated;
grant execute on function public.admin_publish_route_shape_version(uuid) to authenticated;
grant execute on function public.get_admin_route_shape_versions(uuid) to authenticated;
grant execute on function public.get_current_route_shape(uuid) to authenticated;
grant execute on function public.get_driver_active_trip_route_shape() to authenticated;

create or replace function public.current_route_shape_id_for_route(p_route_id uuid, p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rs.id from public.route_shapes rs
  where rs.route_id = p_route_id and rs.tenant_id = p_tenant_id and rs.status = 'published' and rs.effective_to is null
  order by rs.version desc limit 1;
$$;
revoke all on function public.current_route_shape_id_for_route(uuid, uuid) from public, anon;

-- Update supported driver trip start RPCs to snapshot the current published shape.
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
  if auth.uid() is null or public.current_user_role() <> 'driver' then raise exception 'Only a driver can start a trip.' using errcode = '42501'; end if;
  if v_driver_id is null or v_tenant_id is null then raise exception 'An active driver identity is required.' using errcode = '42501'; end if;
  if p_assignment_id is null then raise exception 'Assignment not found.' using errcode = 'P0002'; end if;
  perform 1 from public.drivers d where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active' for update;
  if not found then raise exception 'An active driver identity is required.' using errcode = '42501'; end if;
  if exists (select 1 from public.driver_trips dt where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active') then raise exception 'You already have an active trip. End it before starting another.' using errcode = '55006'; end if;
  select dra.* into v_assignment from public.driver_route_assignments dra where dra.id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found.' using errcode = 'P0002'; end if;
  if v_assignment.tenant_id <> v_tenant_id or v_assignment.driver_id <> v_driver_id then raise exception 'This assignment does not belong to the current driver.' using errcode = '42501'; end if;
  if v_assignment.status <> 'active' or (v_assignment.effective_from is not null and v_assignment.effective_from > current_date) or (v_assignment.effective_to is not null and v_assignment.effective_to < current_date) then raise exception 'This assignment is not active today.' using errcode = '55006'; end if;
  perform 1 from public.buses b where b.id = v_assignment.bus_id and b.tenant_id = v_tenant_id and b.status = 'active' for update;
  if not found then raise exception 'The assigned bus is not active.' using errcode = '55006'; end if;
  if exists (select 1 from public.driver_trips dt where dt.bus_id = v_assignment.bus_id and dt.tenant_id = v_tenant_id and dt.status = 'active') then raise exception 'This bus already has an active trip. Choose another assignment or contact your transportation admin.' using errcode = '55006'; end if;
  select rtp.* into v_pattern
  from public.bus_route_assignments bra
  join public.routes r on r.id = bra.route_id and r.tenant_id = bra.tenant_id and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id and rtp.tenant_id = bra.tenant_id and rtp.status = 'active' and not rtp.schedule_review_required
  where bra.id = v_assignment.bus_route_assignment_id and bra.tenant_id = v_assignment.tenant_id and bra.bus_id = v_assignment.bus_id and bra.route_id = v_assignment.route_id and bra.route_trip_pattern_id = v_assignment.route_trip_pattern_id and bra.status = 'active' and (bra.effective_from is null or bra.effective_from <= current_date) and (bra.effective_to is null or bra.effective_to >= current_date);
  if not found then raise exception 'This assignment does not have an active bus service and trip pattern today.' using errcode = '55006'; end if;
  begin
    insert into public.driver_trips (tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id, driver_route_assignment_id, route_shape_id, trip_name_snapshot, trip_type, status, service_date, started_at)
    values (v_assignment.tenant_id, v_assignment.driver_id, v_assignment.bus_id, v_assignment.route_id, v_pattern.id, v_assignment.id, public.current_route_shape_id_for_route(v_assignment.route_id, v_assignment.tenant_id), v_pattern.display_name, case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end, 'active', current_date, now())
    returning * into v_trip;
  exception when unique_violation then raise exception 'A driver or bus active trip was created concurrently. Refresh and try again.' using errcode = '55006'; end;
  return v_trip;
end;
$$;


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
  if auth.uid() is null or public.current_user_role() <> 'driver' then raise exception 'Only a driver can start a trip.' using errcode = '42501'; end if;
  if v_driver_id is null or v_tenant_id is null then raise exception 'An active driver identity is required.' using errcode = '42501'; end if;
  perform 1 from public.buses b where b.id = p_bus_id and b.tenant_id = v_tenant_id and b.status = 'active' for update;
  if not found then raise exception 'Assigned bus is not active.' using errcode = 'P0002'; end if;
  select count(*)::integer, min(dra.id::text)::uuid into v_candidate_count, v_assignment_id
  from public.driver_route_assignments dra
  join public.routes r on r.id = dra.route_id and r.tenant_id = dra.tenant_id and r.status = 'active'
  join public.route_trip_patterns rtp on rtp.id = dra.route_trip_pattern_id and rtp.route_id = dra.route_id and rtp.tenant_id = dra.tenant_id and rtp.status = 'active'
  where dra.tenant_id = v_tenant_id and dra.driver_id = v_driver_id and dra.bus_id = p_bus_id and dra.status = 'active' and (dra.effective_from is null or dra.effective_from <= current_date) and (dra.effective_to is null or dra.effective_to >= current_date);
  if v_candidate_count = 0 then raise exception 'No active assignment exists for this bus today.' using errcode = 'P0002'; end if;
  if v_candidate_count > 1 then raise exception 'This bus has multiple active route assignments today.' using errcode = '55006'; end if;
  select * into v_assignment from public.driver_route_assignments where id = v_assignment_id for update;
  select * into v_pattern from public.route_trip_patterns where id = v_assignment.route_trip_pattern_id;
  begin
    insert into public.driver_trips (tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id, driver_route_assignment_id, route_shape_id, trip_name_snapshot, trip_type, status, service_date, started_at)
    values (v_tenant_id, v_driver_id, p_bus_id, v_assignment.route_id, v_pattern.id, v_assignment.id, public.current_route_shape_id_for_route(v_assignment.route_id, v_tenant_id), v_pattern.display_name, case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end, 'active', current_date, now()) returning * into v_trip;
  exception when unique_violation then raise exception 'The driver or bus already has an active trip.' using errcode = '55006'; end;
  return v_trip;
end;
$$;
revoke all on function public.start_driver_trip_from_bus(uuid) from public, anon;
grant execute on function public.start_driver_trip_from_bus(uuid) to authenticated;
comment on function public.start_driver_trip_from_bus(uuid) is
  'Deprecated compatibility trip start. It preserves current behavior while snapshotting the current published route shape when one exists.';

create or replace function public.get_admin_live_route_overlays()
returns table (route_id uuid, route_code text, route_name text, route_kind text, map_color text, trip_pattern_id uuid, trip_name text, direction text, stops jsonb, route_shape_geojson jsonb, route_shape_version integer, route_shape_distance_meters double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with active_routes as (
    select distinct dt.route_id, dt.route_trip_pattern_id, dt.route_shape_id from public.driver_trips dt
    where dt.status = 'active' and dt.tenant_id = public.current_tenant_id() and auth.uid() is not null and public.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
  )
  select r.id, r.route_code, r.route_name, r.route_kind, r.map_color, rtp.id, rtp.display_name, rtp.direction,
    coalesce(jsonb_agg(jsonb_build_object('id', rs.id, 'name', rs.stop_name, 'order', rs.stop_order, 'latitude', rs.latitude, 'longitude', rs.longitude, 'plannedArrivalTime', rs.planned_arrival_time) order by case when rtp.direction = 'reverse' then -rs.stop_order else rs.stop_order end) filter (where rs.latitude is not null and rs.longitude is not null), '[]'::jsonb),
    extensions.st_asgeojson(shape.path)::jsonb,
    shape.version,
    shape.distance_meters
  from active_routes ar
  join public.routes r on r.id = ar.route_id and r.tenant_id = public.current_tenant_id()
  join public.route_trip_patterns rtp on rtp.id = ar.route_trip_pattern_id and rtp.route_id = r.id and rtp.tenant_id = r.tenant_id
  left join public.route_stops rs on rs.route_id = r.id and rs.tenant_id = r.tenant_id and rs.status = 'active'
  left join lateral (
    select rs2.* from public.route_shapes rs2
    where rs2.tenant_id = r.tenant_id
      and (rs2.id = ar.route_shape_id or (ar.route_shape_id is null and rs2.route_id = r.id and rs2.status = 'published' and rs2.effective_to is null))
    order by case when rs2.id = ar.route_shape_id then 0 else 1 end, rs2.version desc
    limit 1
  ) shape on true
  group by r.id, r.route_code, r.route_name, r.route_kind, r.map_color, rtp.id, rtp.display_name, rtp.direction, shape.path, shape.version, shape.distance_meters
  order by r.route_code, rtp.display_name;
$$;
revoke all on function public.get_admin_live_route_overlays() from public, anon;
grant execute on function public.get_admin_live_route_overlays() to authenticated;
