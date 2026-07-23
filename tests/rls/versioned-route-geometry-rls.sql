-- Manual DEV RLS/RPC checklist for PostGIS Milestone 2 route geometry.
-- Apply migrations through hosted Supabase DEV SQL Editor before running.
-- These assertions cover tenant-safe route shape creation/listing/publishing,
-- GeoJSON validation, historical trip shape snapshots, and denied roles.

begin;

-- Expected manual cases:
-- 1. tenant/transportation admin calls admin_create_route_shape_version(route_id, LineString GeoJSON, 'draft') and receives tenant-owned version 1.
-- 2. cross-tenant route_id passed to admin_create_route_shape_version raises Route not found.
-- 3. malformed JSON, Polygon GeoJSON, [latitude,longitude] values with latitude outside valid longitude/latitude order, duplicate-only points, and zero-length lines raise safe 22023 errors.
-- 4. admin_publish_route_shape_version publishes one shape and archives prior current published shape without deleting history.
-- 5. start_driver_trip_from_assignment snapshots public.current_route_shape_id_for_route into driver_trips.route_shape_id when a current published shape exists.
-- 6. trips still start with route_shape_id null when no shape exists.
-- 7. guardian role cannot execute get_admin_route_shape_versions/admin_create_route_shape_version.
-- 8. driver can execute get_driver_active_trip_route_shape only for their own active trip snapshot, not an unrelated shape.
-- 9. direct insert/update/delete on public.route_shapes as authenticated client is denied.

select has_function_privilege('authenticated', 'public.admin_create_route_shape_version(uuid,jsonb,text,text)', 'execute') as admin_create_granted;
select not has_function_privilege('anon', 'public.admin_create_route_shape_version(uuid,jsonb,text,text)', 'execute') as anon_create_denied;
select not has_table_privilege('authenticated', 'public.route_shapes', 'insert') as direct_insert_denied;
select not has_table_privilege('authenticated', 'public.route_shapes', 'update') as direct_update_denied;
select not has_table_privilege('authenticated', 'public.route_shapes', 'delete') as direct_delete_denied;
select exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'route_shapes' and indexname = 'route_shapes_path_gist_idx') as gist_index_exists;
select exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'route_shapes' and indexname = 'route_shapes_one_current_published_idx') as one_current_published_index_exists;

rollback;
