-- Unified bus workspace security and lifecycle regression checks.
-- Apply migration 0058 before running this file against hosted Supabase DEV.
begin;

do $$
declare
  v_read_definition text;
  v_end_definition text;
  v_replace_definition text;
  v_read_security_definer boolean;
  v_end_security_definer boolean;
  v_replace_security_definer boolean;
begin
  if to_regprocedure('public.get_admin_bus_workspace(uuid)') is null
    or to_regprocedure('public.admin_end_bus_route_assignment(uuid)') is null
    or to_regprocedure('public.admin_replace_bus_trip_driver(uuid,uuid,date,date)') is null then
    raise exception 'TEST FAILED: unified bus workspace RPC contract is incomplete';
  end if;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_read_security_definer, v_read_definition
  from pg_proc p
  where p.oid = 'public.get_admin_bus_workspace(uuid)'::regprocedure;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_end_security_definer, v_end_definition
  from pg_proc p
  where p.oid = 'public.admin_end_bus_route_assignment(uuid)'::regprocedure;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_replace_security_definer, v_replace_definition
  from pg_proc p
  where p.oid = 'public.admin_replace_bus_trip_driver(uuid,uuid,date,date)'::regprocedure;

  if v_read_security_definer then
    raise exception 'TEST FAILED: workspace reader must remain SECURITY INVOKER';
  end if;
  if not v_end_security_definer or not v_replace_security_definer then
    raise exception 'TEST FAILED: atomic lifecycle writers must be SECURITY DEFINER';
  end if;

  if position('is_transportation_write_admin()' in v_read_definition) = 0
    or position('current_tenant_id()' in v_read_definition) = 0
    or position('b.tenant_id = public.current_tenant_id()' in v_read_definition) = 0
    or position('bra.tenant_id = public.current_tenant_id()' in v_read_definition) = 0
    or position('sba.tenant_id = public.current_tenant_id()' in v_read_definition) = 0 then
    raise exception 'TEST FAILED: workspace reader lacks role or same-tenant boundaries';
  end if;

  if position('auth.uid() is null' in v_end_definition) = 0
    or position('tenant_id = v_tenant_id' in v_end_definition) = 0
    or position('dt.status = ''active''' in v_end_definition) = 0
    or position('update public.driver_route_assignments' in v_end_definition) = 0
    or position('update public.student_bus_assignments' in v_end_definition) = 0
    or position('update public.bus_route_assignments' in v_end_definition) = 0 then
    raise exception 'TEST FAILED: route ending lacks tenant, active-trip, or cascade safety';
  end if;

  if position('auth.uid() is null' in v_replace_definition) = 0
    or position('tenant_id = v_tenant_id' in v_replace_definition) = 0
    or position('d.status = ''active''' in v_replace_definition) = 0
    or position('dt.status = ''active''' in v_replace_definition) = 0
    or position('update public.driver_route_assignments' in v_replace_definition) = 0
    or position('insert into public.driver_route_assignments' in v_replace_definition) = 0 then
    raise exception 'TEST FAILED: driver replacement lacks tenant, driver, active-trip, or history safety';
  end if;

  if has_function_privilege('public', 'public.get_admin_bus_workspace(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_admin_bus_workspace(uuid)', 'EXECUTE')
    or has_function_privilege('public', 'public.admin_end_bus_route_assignment(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_end_bus_route_assignment(uuid)', 'EXECUTE')
    or has_function_privilege('public', 'public.admin_replace_bus_trip_driver(uuid,uuid,date,date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_replace_bus_trip_driver(uuid,uuid,date,date)', 'EXECUTE') then
    raise exception 'TEST FAILED: bus workspace RPCs are exposed anonymously';
  end if;

  if not has_function_privilege('authenticated', 'public.get_admin_bus_workspace(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.admin_end_bus_route_assignment(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.admin_replace_bus_trip_driver(uuid,uuid,date,date)', 'EXECUTE') then
    raise exception 'TEST FAILED: authenticated bus workspace execution is missing';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_admin_bus_workspace(gen_random_uuid());
    raise exception 'TEST FAILED: anonymous workspace read was not denied';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_end_bus_route_assignment(gen_random_uuid());
    raise exception 'TEST FAILED: anonymous route ending was not denied';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_replace_bus_trip_driver(
      gen_random_uuid(),
      gen_random_uuid(),
      current_date,
      null
    );
    raise exception 'TEST FAILED: anonymous driver replacement was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
