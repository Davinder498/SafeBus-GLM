-- Unified direction assignment and QR selection security contract checks.
-- Apply through migration 0063 before running against hosted Supabase DEV.
begin;

do $$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.admin_set_bus_route_service(uuid,uuid,text,date,date,uuid[])',
    'public.admin_end_bus_route_service(uuid[])',
    'public.admin_set_student_bus_service(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,date,date,uuid[])',
    'public.admin_set_student_bus_service_status(uuid[],text,boolean)',
    'public.get_bus_qr_start_options(text)',
    'public.start_bus_tracking_from_qr(text,uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'TEST FAILED: missing unified direction RPC %', v_signature;
    end if;
    if has_function_privilege('public', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE')
      or not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'TEST FAILED: incorrect execute grants for %', v_signature;
    end if;
    select lower(pg_get_functiondef(to_regprocedure(v_signature))) into v_definition;
    if position('security definer' in v_definition) = 0 then
      raise exception 'TEST FAILED: % is not SECURITY DEFINER', v_signature;
    end if;
  end loop;

  select lower(pg_get_functiondef(
    'public.admin_set_bus_route_service(uuid,uuid,text,date,date,uuid[])'::regprocedure
  )) into v_definition;
  if position('is_transportation_write_admin()' in v_definition) = 0
    or position('current_tenant_id()' in v_definition) = 0
    or position('p_direction_scope not in' in v_definition) = 0
    or position('daterange(' in v_definition) = 0
    or position('for update' in v_definition) = 0
    or position('insert into public.bus_route_assignments' in v_definition) = 0 then
    raise exception 'TEST FAILED: grouped bus writer lacks tenant, scope, overlap, locking, or atomic inserts';
  end if;

  select lower(pg_get_functiondef(
    'public.admin_set_student_bus_service(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,date,date,uuid[])'::regprocedure
  )) into v_definition;
  if position('is_transportation_write_admin()' in v_definition) = 0
    or position('p_forward_pickup_stop_id' in v_definition) = 0
    or position('p_reverse_pickup_stop_id' in v_definition) = 0
    or position('bus_route_assignment_id = v_bus_service.id' in v_definition) = 0
    or position('insert into public.student_bus_assignments' in v_definition) = 0 then
    raise exception 'TEST FAILED: grouped student writer lacks tenant, directional stops, exact service, or atomic inserts';
  end if;

  select lower(pg_get_functiondef('public.get_bus_qr_start_options(text)'::regprocedure))
    into v_definition;
  if position('current_user_role() <> ''driver''' in v_definition) = 0
    or position('hash_bus_tracking_token(p_qr_token)' in v_definition) = 0
    or position('bra.bus_id = v_bus.id' in v_definition) = 0
    or position('bra.effective_from' in v_definition) = 0
    or position('bra.effective_to' in v_definition) = 0 then
    raise exception 'TEST FAILED: QR choices lack driver, hashed-token, bus, or effective-date enforcement';
  end if;

  if to_regprocedure('public.start_bus_tracking_from_qr(text)') is not null then
    raise exception 'TEST FAILED: obsolete immediate QR start overload still exists';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_bus_qr_start_options('sbus_bus_v1_' || repeat('A', 43));
    raise exception 'TEST FAILED: anonymous QR option lookup was not denied';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_set_bus_route_service(
      gen_random_uuid(), gen_random_uuid(), 'both', current_date, null, array[]::uuid[]
    );
    raise exception 'TEST FAILED: anonymous grouped route write was not denied';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
