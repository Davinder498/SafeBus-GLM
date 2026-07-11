-- SafeBus Alberta - Milestone 10A admin live fleet monitoring RLS/RPC checks
--
-- This file is intentionally structural and execution-safe for the automated
-- runner list: it verifies the new RPC exists with a safe return shape and
-- hardened execute grants. Full tenant fixture execution should be added to the
-- DEV SQL playbook before applying this migration to shared environments.

do $$
declare
  v_function_oid oid;
  v_forbidden_count integer;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
begin
  select p.oid into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_live_fleet_monitoring'
    and pg_get_function_arguments(p.oid) = '';

  if v_function_oid is null then
    raise exception 'TEST FAILED: get_admin_live_fleet_monitoring() does not exist';
  end if;

  select count(*) into v_forbidden_count
  from information_schema.routine_columns
  where specific_schema = 'public'
    and routine_name = 'get_admin_live_fleet_monitoring'
    and column_name in (
      'tenant_id', 'trip_id', 'bus_id', 'route_id', 'driver_id',
      'student_id', 'guardian_id', 'email', 'phone', 'home_address',
      'student_name', 'guardian_name', 'driver_email', 'driver_phone'
    );

  if v_forbidden_count <> 0 then
    raise exception 'TEST FAILED: admin fleet RPC exposes % forbidden column(s)', v_forbidden_count;
  end if;

  v_public_execute := has_function_privilege('public', v_function_oid, 'EXECUTE');
  v_anon_execute := has_function_privilege('anon', v_function_oid, 'EXECUTE');
  v_authenticated_execute := has_function_privilege('authenticated', v_function_oid, 'EXECUTE');

  if v_public_execute then
    raise exception 'TEST FAILED: public can execute get_admin_live_fleet_monitoring()';
  end if;

  if v_anon_execute then
    raise exception 'TEST FAILED: anon can execute get_admin_live_fleet_monitoring()';
  end if;

  if not v_authenticated_execute then
    raise exception 'TEST FAILED: authenticated cannot execute get_admin_live_fleet_monitoring()';
  end if;

  raise notice 'TEST PASSED: admin live fleet RPC exists with safe shape and hardened grants';
end
$$;
