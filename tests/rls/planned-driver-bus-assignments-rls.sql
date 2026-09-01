-- Planned driver/bus assignment structural and authorization regression.
--
-- Do not run this file against production. Execute only after the migration is
-- applied to an explicitly approved isolated development or staging database.
begin;

do $$
declare
  v_definition text;
  v_security_definer boolean;
  v_driver_select_qual text;
begin
  if to_regprocedure(
    'public.admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)'
  ) is null then
    raise exception 'TEST FAILED: planned assignment RPC is missing';
  end if;

  select p.prosecdef, lower(pg_get_functiondef(p.oid))
  into v_security_definer, v_definition
  from pg_proc p
  where p.oid =
    'public.admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)'::regprocedure;

  if not v_security_definer then
    raise exception 'TEST FAILED: planned assignment writer must be SECURITY DEFINER';
  end if;

  select lower(qual)
  into v_driver_select_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'driver_route_assignments'
    and policyname = 'driver_route_assignments select own driver';

  if v_driver_select_qual is null
    or position('driver_id' in v_driver_select_qual) = 0
    or position('current_driver_id()' in v_driver_select_qual) = 0
    or position('tenant_id' in v_driver_select_qual) = 0
    or position('current_tenant_id()' in v_driver_select_qual) = 0 then
    raise exception 'TEST FAILED: driver planned reads are not limited to the current driver and tenant';
  end if;

  if position('current_user_role() <> ''tenant_admin''' in v_definition) = 0
    or position('bra.tenant_id = v_tenant_id' in v_definition) = 0
    or position('d.tenant_id = v_tenant_id' in v_definition) = 0
    or position('rtp.schedule_review_required' in v_definition) = 0
    or position('dt.status in (''active'', ''paused'')' in v_definition) = 0
    or position('v_existing.route_trip_pattern_id = v_service.route_trip_pattern_id' in v_definition) = 0
    or position('v_existing.bus_route_assignment_id = v_service.id' in v_definition) = 0
    or position('update public.driver_route_assignments' in v_definition) = 0
    or position('insert into public.driver_route_assignments' in v_definition) = 0 then
    raise exception 'TEST FAILED: planned assignment writer lacks required tenant, readiness, edit-mode, trip, or history safeguards';
  end if;

  if position('insert into public.driver_trips' in v_definition) > 0 then
    raise exception 'TEST FAILED: planning RPC must not create operational trips';
  end if;

  if has_function_privilege(
      'public',
      'public.admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: planned assignment writer is exposed anonymously';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)',
    'EXECUTE'
  ) then
    raise exception 'TEST FAILED: authenticated planned assignment execution is missing';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.start_driver_trip_from_assignment(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_current_driver_trip_assignments()',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: retired assignment-start RPCs were re-enabled';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.admin_set_driver_bus_assignment(
      gen_random_uuid(),
      gen_random_uuid(),
      current_date,
      null,
      null
    );
    raise exception 'TEST FAILED: anonymous planned assignment write was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
