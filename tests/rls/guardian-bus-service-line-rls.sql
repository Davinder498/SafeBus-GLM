-- Guardian bus service-line structural and privilege regression checks.
-- Apply through migration 0097 in an approved isolated database before running.
begin;

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.get_guardian_bus_service_lines(text)') is null then
    raise exception 'TEST FAILED: guardian bus service-line RPC is missing';
  end if;

  select lower(pg_get_functiondef(
    'public.get_guardian_bus_service_lines(text)'::regprocedure
  )) into v_definition;

  if position('security definer' in v_definition) = 0
    or position('auth.uid() is null' in v_definition) = 0
    or position('current_user_role()' in v_definition) = 0
    or position('current_guardian_id()' in v_definition) = 0
    or position('current_tenant_id()' in v_definition) = 0
    or position('student_guardians' in v_definition) = 0
    or position('access_expires_at' in v_definition) = 0
    or position('student_bus_assignments' in v_definition) = 0
    or position('bus_route_assignments' in v_definition) = 0
    or position('route_trip_pattern_id' in v_definition) = 0
    or position('driver_trip_current_locations' in v_definition) = 0 then
    raise exception 'TEST FAILED: guardian bus service-line RPC lacks exact guardian, tenant, assignment, trip, or location checks';
  end if;

  if position('''stops''' in v_definition) = 0
    or position('''name''' in v_definition) = 0
    or position('''order''' in v_definition) = 0
    or position('''latitude''' in v_definition) = 0
    or position('''longitude''' in v_definition) = 0
    or position('''tripstatus''' in v_definition) = 0
    or position('''locationstate''' in v_definition) = 0 then
    raise exception 'TEST FAILED: guardian bus service-line response lacks required presentation fields';
  end if;

  if position('''routeid''' in v_definition) > 0
    or position('''tripid''' in v_definition) > 0
    or position('''driverid''' in v_definition) > 0
    or position('''busid''' in v_definition) > 0
    or position('''studentid''' in v_definition) > 0
    or position('''studentname''' in v_definition) > 0
    or position('''tenantid''' in v_definition) > 0
    or position('''drivername''' in v_definition) > 0
    or position('''contact''' in v_definition) > 0 then
    raise exception 'TEST FAILED: guardian bus service-line JSON exposes internal or unrelated fields';
  end if;

  if has_function_privilege(
      'public', 'public.get_guardian_bus_service_lines(text)', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.get_guardian_bus_service_lines(text)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'public.get_guardian_bus_service_lines(text)', 'EXECUTE'
    ) then
    raise exception 'TEST FAILED: guardian bus service-line execute privileges are incorrect';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_guardian_bus_service_lines('42');
    raise exception 'TEST FAILED: anonymous guardian bus service-line access was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
