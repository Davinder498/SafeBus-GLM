-- Bounded READ ONLY regression: synthetic VALUES only; no schema changes,
-- fixtures, route records, writer RPC calls or persistent/external effects.
-- EXPLAIN below has NO ANALYZE: statements are parsed/planned, never executed.
-- The declarations reproduce the RPC's RETURNS TABLE output-variable names.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

do $$
#variable_conflict error
declare
  id uuid;
  route_id uuid;
  version integer;
  status text;
  effective_from timestamptz;
  effective_to timestamptz;
  p_route_id uuid := '00000000-0000-0000-0000-000000000001';
  p_route_shape_id uuid := '00000000-0000-0000-0000-000000000003';
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000002';
  v_route record;
  v_shape record;
  v_ambiguous boolean := false;
  v_count integer;
  v_time timestamptz;
begin
  begin
    perform 1 from (values (p_route_id)) r(id) where id = p_route_id;
  exception when ambiguous_column then
    v_ambiguous := true;
  end;
  if not v_ambiguous then raise exception 'FAIL: original id collision did not reproduce'; end if;

  select r.* into strict v_route
  from (values
    (p_route_id, v_tenant_id, 'active'),
    ('00000000-0000-0000-0000-000000000009'::uuid, v_tenant_id, 'active'),
    (p_route_id, '00000000-0000-0000-0000-000000000008'::uuid, 'active'),
    (p_route_id, v_tenant_id, 'archived')
  ) r(id, tenant_id, status)
  where r.id = p_route_id and r.tenant_id = v_tenant_id and r.status <> 'archived';

  select rs.* into strict v_shape
  from (values (p_route_shape_id, p_route_id, v_tenant_id)) rs(id, route_id, tenant_id)
  where rs.id = p_route_shape_id and rs.tenant_id = v_tenant_id;

  select count(*) into v_count
  from (values
    ('00000000-0000-0000-0000-000000000004'::uuid, p_route_id, 'published', null::timestamptz),
    (p_route_shape_id, p_route_id, 'published', null::timestamptz),
    ('00000000-0000-0000-0000-000000000005'::uuid, p_route_id, 'draft', null::timestamptz),
    ('00000000-0000-0000-0000-000000000006'::uuid, p_route_id, 'published', now()),
    ('00000000-0000-0000-0000-000000000007'::uuid, '00000000-0000-0000-0000-000000000009'::uuid, 'published', null::timestamptz)
  ) rs(id, route_id, status, effective_to)
  where rs.route_id = v_shape.route_id and rs.id <> v_shape.id and rs.status = 'published' and rs.effective_to is null;
  if v_count <> 1 then raise exception 'FAIL: publication history scope changed'; end if;

  select coalesce(rs.effective_from, now()) into v_time
  from (values (p_route_shape_id, '2026-01-01T00:00:00Z'::timestamptz)) rs(id, effective_from)
  where rs.id = v_shape.id;
  if v_time <> '2026-01-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL: publishing no longer preserves the original effective_from';
  end if;
end;
$$;

-- Validate the actual DML syntax under colliding PL/pgSQL variable names.
-- Permission denial is expected: authenticated writes through these RPCs,
-- rather than writing route_shapes directly. Ambiguity/syntax errors must fail.
do $$
#variable_conflict error
declare
  id uuid;
  route_id uuid;
  version integer;
  status text;
  effective_from timestamptz;
  effective_to timestamptz;
  p_route_id uuid := '00000000-0000-0000-0000-000000000001';
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000002';
  v_shape record;
  v_geom extensions.geometry(LineString, 4326) := extensions.st_geomfromtext('LINESTRING(0 0, 0.01 0.01)', 4326);
  v_version integer := 1;
  p_status text := 'draft';
  p_source text := 'admin_geojson';
  v_plan record;
begin
  select '00000000-0000-0000-0000-000000000003'::uuid as id, p_route_id as route_id into v_shape;
  begin
    for v_plan in
      explain (costs false)
      insert into public.route_shapes as rs (tenant_id, route_id, version, path, distance_meters, status, source, effective_from, created_by)
      values (v_tenant_id, p_route_id, v_version, v_geom, extensions.st_length(v_geom::extensions.geography), p_status, coalesce(p_source, 'admin_geojson'), case when p_status = 'published' then now() else null end, auth.uid())
      returning rs.*
    loop null; end loop;
  exception when insufficient_privilege then null;
  end;
  begin
    for v_plan in
      explain (costs false)
      update public.route_shapes rs set status = 'archived', effective_to = now()
      where rs.route_id = p_route_id and rs.id <> v_shape.id and rs.status = 'published' and rs.effective_to is null
    loop null; end loop;
  exception when insufficient_privilege then null;
  end;
  begin
    for v_plan in
      explain (costs false)
      update public.route_shapes rs set status = 'archived', effective_to = now()
      where rs.route_id = v_shape.route_id and rs.id <> v_shape.id and rs.status = 'published' and rs.effective_to is null
    loop null; end loop;
  exception when insufficient_privilege then null;
  end;
  begin
    for v_plan in
      explain (costs false)
      update public.route_shapes rs set status = 'published', effective_from = coalesce(rs.effective_from, now()), effective_to = null
      where rs.id = v_shape.id returning rs.*
    loop null; end loop;
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'PASS: original ambiguity reproduced; qualified predicates and nonexecuting writer EXPLAIN checks verified without writes' as result;
rollback;
