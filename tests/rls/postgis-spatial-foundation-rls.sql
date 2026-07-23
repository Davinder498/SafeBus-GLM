-- SafeBus Alberta - PostGIS spatial foundation structural RLS/RPC checks
-- Execution-safe structural assertions for the SQL/RLS runner. Tenant fixture
-- execution should be performed in hosted DEV using the manual playbook.

do $$
declare
  v_viewport_oid oid;
  v_distance_oid oid;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_missing_count integer;
begin
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    raise exception 'TEST FAILED: postgis extension is not installed';
  end if;

  select count(*) into v_missing_count
  from (values
    ('driver_trip_current_locations'::text, 'location_geog'::text),
    ('route_stops', 'location_geog'),
    ('schools', 'latitude'),
    ('schools', 'longitude'),
    ('schools', 'location_geog')
  ) expected(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name
  );

  if v_missing_count <> 0 then
    raise exception 'TEST FAILED: missing % PostGIS foundation column(s)', v_missing_count;
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'driver_trip_current_locations_location_geog_gist_idx' and indexdef ilike '%gist%') then
    raise exception 'TEST FAILED: missing current location GiST index';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'route_stops_location_geog_gist_idx' and indexdef ilike '%gist%') then
    raise exception 'TEST FAILED: missing route stops GiST index';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'schools_location_geog_gist_idx' and indexdef ilike '%gist%') then
    raise exception 'TEST FAILED: missing schools GiST index';
  end if;

  select p.oid into v_viewport_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_live_fleet_monitoring_in_viewport'
    and pg_get_function_arguments(p.oid) = 'p_south_latitude double precision, p_west_longitude double precision, p_north_latitude double precision, p_east_longitude double precision';

  if v_viewport_oid is null then
    raise exception 'TEST FAILED: viewport RPC does not exist';
  end if;

  v_public_execute := has_function_privilege('public', v_viewport_oid, 'EXECUTE');
  v_anon_execute := has_function_privilege('anon', v_viewport_oid, 'EXECUTE');
  v_authenticated_execute := has_function_privilege('authenticated', v_viewport_oid, 'EXECUTE');

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'TEST FAILED: viewport RPC grants are not hardened';
  end if;

  select p.oid into v_distance_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_live_trip_stop_distance_metres'
    and pg_get_function_arguments(p.oid) = 'p_driver_trip_id uuid, p_route_stop_id uuid';

  if v_distance_oid is null then
    raise exception 'TEST FAILED: distance helper does not exist';
  end if;

  raise notice 'TEST PASSED: PostGIS foundation columns, indexes, and hardened RPC grants exist';
end
$$;
