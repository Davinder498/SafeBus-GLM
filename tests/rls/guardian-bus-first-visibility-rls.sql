-- Guardian bus-first visibility structural and privilege regression checks.
-- Apply through migration 0087 before running against hosted Supabase DEV.
begin;

do $$
declare
  v_definition text;
  v_result text;
  v_legacy regprocedure;
begin
  if to_regprocedure('public.get_guardian_bus_visibility_v2()') is null then
    raise exception 'TEST FAILED: guardian bus-first RPC is missing';
  end if;

  select lower(pg_get_functiondef('public.get_guardian_bus_visibility_v2()'::regprocedure)) into v_definition;
  select lower(pg_get_function_result('public.get_guardian_bus_visibility_v2()'::regprocedure)) into v_result;

  if position('security definer' in v_definition) = 0
    or position('auth.uid() is not null' in v_definition) = 0
    or position('current_user_role()' in v_definition) = 0
    or position('current_guardian_id()' in v_definition) = 0
    or position('current_tenant_id()' in v_definition) = 0
    or position('student_guardians' in v_definition) = 0
    or position('access_expires_at' in v_definition) = 0
    or position('get_guardian_bus_visibility()' in v_definition) = 0 then
    raise exception 'TEST FAILED: guardian bus-first RPC lacks role, tenant, link, or expiry enforcement';
  end if;

  if position('bus_number text' in v_result) = 0
    or position('license_plate text' in v_result) = 0
    or position('assignment_state text' in v_result) = 0
    or position('has_active_trip boolean' in v_result) = 0
    or position('location_state text' in v_result) = 0
    or position('eta_label text' in v_result) = 0
    or position('student_trip_status text' in v_result) = 0 then
    raise exception 'TEST FAILED: guardian bus-first result is missing required safe fields';
  end if;

  if position('route_id' in v_result) > 0
    or position('route_name' in v_result) > 0
    or position('route_code' in v_result) > 0
    or position('stop' in v_result) > 0
    or position('driver_id' in v_result) > 0
    or position('bus_id' in v_result) > 0
    or position('trip_id' in v_result) > 0
    or position('speed' in v_result) > 0
    or position('tenant' in v_result) > 0
    or position('guardian' in v_result) > 0
    or position('contact' in v_result) > 0 then
    raise exception 'TEST FAILED: guardian bus-first result exposes operational or internal fields: %', v_result;
  end if;

  if has_function_privilege('public', 'public.get_guardian_bus_visibility_v2()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_guardian_bus_visibility_v2()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_guardian_bus_visibility_v2()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_guardian_bus_visibility()', 'EXECUTE') then
    raise exception 'TEST FAILED: guardian bus-first RPC execute privileges are incorrect';
  end if;

  foreach v_legacy in array array[
    'public.get_guardian_student_route_visibility()'::regprocedure,
    'public.get_guardian_live_trip_visibility()'::regprocedure,
    'public.get_guardian_live_route_overlays()'::regprocedure,
    'public.get_guardian_student_trip_event_visibility()'::regprocedure,
    'public.get_guardian_student_live_bus_location_state()'::regprocedure
  ] loop
    if has_function_privilege('authenticated', v_legacy, 'EXECUTE') then
      raise exception 'TEST FAILED: legacy route-oriented guardian RPC remains executable: %', v_legacy;
    end if;
  end loop;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_guardian_bus_visibility_v2();
    raise exception 'TEST FAILED: anonymous guardian bus visibility was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
