-- Phase 12.6 structural RLS/RPC regression checklist.
-- Apply migrations through 0036, then execute this file in a disposable hosted
-- DEV database SQL editor or psql session. It intentionally validates catalog
-- structure and summary-contract shape without reading production data.

do $$
declare
  v_policy_count integer;
  v_platform_columns text[];
begin
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'schools','students','guardians','student_guardians','buses','drivers','routes','route_stops',
      'student_route_assignments','driver_trips','driver_trip_location_updates','driver_trip_current_locations',
      'driver_route_assignments','bus_route_assignments','student_bus_assignments'
    )
    and (policyname ilike '%platform admin%' or qual ilike '%is_platform_super_admin%');

  if v_policy_count <> 0 then
    raise exception 'Phase 12.6 FAILED: % platform operational RLS policies remain', v_policy_count;
  end if;

  select array_agg(column_name::text order by ordinal_position) into v_platform_columns
  from information_schema.routine_columns
  where specific_schema = 'public'
    and routine_name = 'get_platform_tenant_onboarding_summary';

  if v_platform_columns && array[
    'student_id','student_name','first_name','last_name','guardian_id','guardian_name','driver_id','driver_name',
    'route_id','route_name','stop_name','pickup_stop_id','dropoff_stop_id','trip_id','latitude','longitude'
  ] then
    raise exception 'Phase 12.6 FAILED: platform summary exposes sensitive columns: %', v_platform_columns;
  end if;

  raise notice 'Phase 12.6 PASSED: platform operational policies removed and summary contract is aggregate-only.';
end $$;
