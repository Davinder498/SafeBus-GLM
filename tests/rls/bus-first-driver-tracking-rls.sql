-- Bus-first driver tracking security and contract regression checks.
begin;

do $$
declare
  v_start_def text;
  v_guardian_def text;
begin
  if to_regprocedure('public.start_driver_trip_from_bus(uuid)') is null then
    raise exception 'TEST FAILED: bus-first trip start RPC is missing';
  end if;
  if has_function_privilege('public', 'public.start_driver_trip_from_bus(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.start_driver_trip_from_bus(uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: bus-first trip start is exposed publicly';
  end if;
  if not has_function_privilege('authenticated', 'public.start_driver_trip_from_bus(uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: authenticated drivers cannot execute bus-first start';
  end if;

  select pg_get_functiondef('public.start_driver_trip_from_bus(uuid)'::regprocedure) into v_start_def;
  if position('current_driver_id()' in v_start_def) = 0
    or position('current_tenant_id()' in v_start_def) = 0
    or position('multiple active route assignments' in v_start_def) = 0 then
    raise exception 'TEST FAILED: bus-first start lacks driver, tenant, or ambiguity enforcement';
  end if;

  select pg_get_functiondef('public.get_guardian_student_live_bus_location_state()'::regprocedure)
    into v_guardian_def;
  if position('student_bus_assignments' in v_guardian_def) = 0
    or position('dt.bus_id = bra.bus_id' in v_guardian_def) = 0 then
    raise exception 'TEST FAILED: guardian visibility is not based on active student-bus assignment';
  end if;
  if position('student_route_assignments' in v_guardian_def) > 0 then
    raise exception 'TEST FAILED: guardian bus map still depends on student route assignment';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.start_driver_trip_from_bus(gen_random_uuid());
    raise exception 'TEST FAILED: anonymous bus-first start was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
