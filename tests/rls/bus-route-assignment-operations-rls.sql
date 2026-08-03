-- Server-enforced bus route assignment update and renewal contract checks.
-- Apply migration 0060 before running this file against hosted Supabase DEV.
begin;

do $$
declare
  v_update_definition text;
  v_renew_definition text;
  v_update_security_definer boolean;
  v_renew_security_definer boolean;
begin
  if to_regprocedure(
    'public.admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)'
  ) is null
    or to_regprocedure('public.admin_renew_bus_route_assignment(uuid,date,date)') is null then
    raise exception 'TEST FAILED: route assignment operation RPC contract is incomplete';
  end if;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_update_security_definer, v_update_definition
  from pg_proc p
  where p.oid =
    'public.admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)'::regprocedure;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_renew_security_definer, v_renew_definition
  from pg_proc p
  where p.oid = 'public.admin_renew_bus_route_assignment(uuid,date,date)'::regprocedure;

  if not v_update_security_definer or not v_renew_security_definer then
    raise exception 'TEST FAILED: route assignment writers must be SECURITY DEFINER';
  end if;

  if position('auth.uid() is null' in v_update_definition) = 0
    or position('current_tenant_id()' in v_update_definition) = 0
    or position('is_transportation_write_admin()' in v_update_definition) = 0
    or position('tenant_id = v_tenant_id' in v_update_definition) = 0
    or position('dt.status = ''active''' in v_update_definition) = 0
    or position('v_identity_changed' in v_update_definition) = 0
    or position('driver_route_assignments' in v_update_definition) = 0
    or position('student_bus_assignments' in v_update_definition) = 0 then
    raise exception 'TEST FAILED: route update lacks tenant, active-trip, or identity safety';
  end if;

  if position('auth.uid() is null' in v_renew_definition) = 0
    or position('current_tenant_id()' in v_renew_definition) = 0
    or position('is_transportation_write_admin()' in v_renew_definition) = 0
    or position('for update' in v_renew_definition) = 0
    or position('dt.status = ''active''' in v_renew_definition) = 0
    or position('update public.bus_route_assignments' in v_renew_definition) = 0
    or position('insert into public.bus_route_assignments' in v_renew_definition) = 0 then
    raise exception 'TEST FAILED: renewal lacks tenant, locking, active-trip, or history safety';
  end if;

  if has_table_privilege('authenticated', 'public.bus_route_assignments', 'UPDATE') then
    raise exception 'TEST FAILED: authenticated users still have direct route assignment updates';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bus_route_assignments'
      and cmd = 'UPDATE'
  ) then
    raise exception 'TEST FAILED: direct route assignment update policy still exists';
  end if;

  if has_function_privilege(
    'public',
    'public.admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)',
    'EXECUTE'
  )
    or has_function_privilege(
      'anon',
      'public.admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)',
      'EXECUTE'
    )
    or has_function_privilege(
      'public',
      'public.admin_renew_bus_route_assignment(uuid,date,date)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.admin_renew_bus_route_assignment(uuid,date,date)',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: route assignment writers are exposed anonymously';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)',
    'EXECUTE'
  )
    or not has_function_privilege(
      'authenticated',
      'public.admin_renew_bus_route_assignment(uuid,date,date)',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: authenticated route assignment execution is missing';
  end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.admin_update_bus_route_assignment(
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      'morning',
      current_date,
      null
    );
    raise exception 'TEST FAILED: anonymous route update was not denied';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_renew_bus_route_assignment(
      gen_random_uuid(),
      current_date,
      null
    );
    raise exception 'TEST FAILED: anonymous route renewal was not denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
