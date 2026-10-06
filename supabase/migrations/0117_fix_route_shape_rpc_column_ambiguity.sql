-- RETURNS TABLE declares PL/pgSQL variables named id, route_id, status, etc.
-- Qualify table references in both writers so these output variables cannot
-- shadow row columns. Keep the existing RPC signatures, authorization, locks,
-- versioning, geometry validation and history-preserving publication behavior.

create or replace function public.admin_create_route_shape_version(p_route_id uuid, p_geojson jsonb, p_status text default 'draft', p_source text default 'admin_geojson')
returns table (id uuid, route_id uuid, version integer, status text, distance_meters double precision, geojson jsonb, effective_from timestamptz, effective_to timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict error
declare
  v_tenant_id uuid := public.require_route_shape_admin();
  v_route public.routes;
  v_geom extensions.geometry(LineString, 4326);
  v_version integer;
  v_shape public.route_shapes;
begin
  if p_status not in ('draft','published') then raise exception 'Route shape status must be draft or published.' using errcode = '22023'; end if;
  if coalesce(p_source, 'admin_geojson') not in ('admin_geojson','import','system') then raise exception 'Route shape source is invalid.' using errcode = '22023'; end if;
  select r.* into v_route from public.routes r
  where r.id = p_route_id and r.tenant_id = v_tenant_id and r.status <> 'archived'
  for update;
  if not found then raise exception 'Route not found.' using errcode = 'P0002'; end if;
  v_geom := public.validate_route_shape_geojson(p_geojson);
  select coalesce(max(rs.version), 0) + 1 into v_version from public.route_shapes rs where rs.route_id = p_route_id;
  insert into public.route_shapes as rs (tenant_id, route_id, version, path, distance_meters, status, source, effective_from, created_by)
  values (v_tenant_id, p_route_id, v_version, v_geom, extensions.st_length(v_geom::extensions.geography), p_status, coalesce(p_source, 'admin_geojson'), case when p_status = 'published' then now() else null end, auth.uid())
  returning rs.* into v_shape;
  if p_status = 'published' then
    update public.route_shapes rs set status = 'archived', effective_to = now()
    where rs.route_id = p_route_id and rs.id <> v_shape.id and rs.status = 'published' and rs.effective_to is null;
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
#variable_conflict error
declare v_tenant_id uuid := public.require_route_shape_admin(); v_shape public.route_shapes;
begin
  select rs.* into v_shape from public.route_shapes rs
  where rs.id = p_route_shape_id and rs.tenant_id = v_tenant_id for update;
  if not found then raise exception 'Route shape not found.' using errcode = 'P0002'; end if;
  update public.route_shapes rs set status = 'archived', effective_to = now()
  where rs.route_id = v_shape.route_id and rs.id <> v_shape.id and rs.status = 'published' and rs.effective_to is null;
  update public.route_shapes rs
  set status = 'published', effective_from = coalesce(rs.effective_from, now()), effective_to = null
  where rs.id = v_shape.id returning rs.* into v_shape;
  return query select v_shape.id, v_shape.route_id, v_shape.version, v_shape.status, v_shape.distance_meters, extensions.st_asgeojson(v_shape.path)::jsonb, v_shape.effective_from, v_shape.effective_to, v_shape.created_at;
end;
$$;

-- CREATE OR REPLACE preserves the existing grants. Reassert the same boundary.
revoke all on function public.admin_create_route_shape_version(uuid, jsonb, text, text) from public, anon;
revoke all on function public.admin_publish_route_shape_version(uuid) from public, anon;
grant execute on function public.admin_create_route_shape_version(uuid, jsonb, text, text) to authenticated;
grant execute on function public.admin_publish_route_shape_version(uuid) to authenticated;
