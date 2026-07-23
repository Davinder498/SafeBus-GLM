-- Driver completed trip history security and privacy regression checks.
begin;

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.get_driver_completed_trip_history(integer)') is null then
    raise exception 'TEST FAILED: driver completed trip history RPC is missing';
  end if;

  if has_function_privilege('public', 'public.get_driver_completed_trip_history(integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_driver_completed_trip_history(integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: completed trip history is exposed anonymously';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_driver_completed_trip_history(integer)',
    'EXECUTE'
  ) then
    raise exception 'TEST FAILED: authenticated driver history execution is missing';
  end if;

  select lower(pg_get_functiondef(
    'public.get_driver_completed_trip_history(integer)'::regprocedure
  )) into v_definition;

  if position('dt.tenant_id = v_tenant_id' in v_definition) = 0
    or position('dt.driver_id = v_driver_id' in v_definition) = 0
    or position('dt.status = ''completed''' in v_definition) = 0
    or position('dt.ended_at is not null' in v_definition) = 0 then
    raise exception 'TEST FAILED: completed history lacks driver, tenant, or lifecycle scoping';
  end if;

  if position('student' in v_definition) > 0
    or position('location' in v_definition) > 0 then
    raise exception 'TEST FAILED: completed trip history accesses student or location data';
  end if;

  if position('r.status = ''active''' in v_definition) > 0 then
    raise exception 'TEST FAILED: historical trips disappear when an admin deactivates a route';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_driver_completed_trip_history(10);
    raise exception 'TEST FAILED: anonymous completed history call was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
