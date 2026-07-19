-- Route/trip pattern structural security regression for migrations 0045-0047.
-- Run only against hosted Supabase DEV after applying the current migrations.
do $$
declare
  v_definition text;
  v_policy_definition text;
  v_security_definer boolean;
begin
  if to_regclass('public.route_trip_patterns') is null then
    raise exception 'Missing route_trip_patterns';
  end if;
  if to_regclass('public.route_trip_stop_schedules') is null then
    raise exception 'Missing route_trip_stop_schedules';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.route_trip_patterns'::regclass) then
    raise exception 'route_trip_patterns RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.route_trip_stop_schedules'::regclass) then
    raise exception 'route_trip_stop_schedules RLS is disabled';
  end if;

  if (
    select count(*) from pg_attribute
    where attrelid = 'public.routes'::regclass
      and attname in ('route_kind', 'map_color', 'definition_status')
      and not attisdropped
  ) <> 3 then
    raise exception 'Route kind/color/readiness columns are incomplete';
  end if;

  select pg_get_expr(policy.polwithcheck, policy.polrelid)
  into v_policy_definition
  from pg_policy policy
  where policy.polrelid = 'public.routes'::regclass
    and policy.polname = 'routes insert tenant admin';
  if v_policy_definition is null
    or position('can_write_optional_school' in v_policy_definition) = 0 then
    raise exception 'Tenant-admin route inserts do not support school-less routes';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.route_stops'::regclass
      and constraint_row.confrelid = 'public.routes'::regclass
      and constraint_row.conkey = array[(
        select attnum::smallint
        from pg_attribute
        where attrelid = 'public.route_stops'::regclass
          and attname = 'route_id'
          and not attisdropped
      )]::smallint[]
      and constraint_row.confkey = array[(
        select attnum::smallint
        from pg_attribute
        where attrelid = 'public.routes'::regclass
          and attname = 'id'
          and not attisdropped
      )]::smallint[]
      and constraint_row.confdeltype = 'c'
      and constraint_row.convalidated
  ) then
    raise exception 'route_stops.route_id foreign key to routes.id is missing or invalid';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.driver_route_assignments'::regclass
      and attname = 'route_trip_pattern_id' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.bus_route_assignments'::regclass
      and attname = 'route_trip_pattern_id' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.student_bus_assignments'::regclass
      and attname = 'route_trip_pattern_id' and not attisdropped
  ) or (
    select count(*) from pg_attribute
    where attrelid = 'public.driver_trips'::regclass
      and attname in ('route_trip_pattern_id', 'trip_name_snapshot')
      and not attisdropped
  ) <> 2 then
    raise exception 'Trip pattern references are incomplete';
  end if;

  select p.prosecdef, pg_get_functiondef(p.oid)
  into v_security_definer, v_definition
  from pg_proc p
  where p.oid = 'public.admin_save_route_definition(jsonb,jsonb,jsonb)'::regprocedure;
  if v_security_definer then
    raise exception 'Route definition writer must remain SECURITY INVOKER';
  end if;
  if position('current_user_role() <> ''tenant_admin''' in v_definition) = 0
    or position('current_tenant_id()' in v_definition) = 0
    or position('jsonb_object_keys' in v_definition) = 0 then
    raise exception 'Route writer is missing role, tenant, or payload validation';
  end if;

  select pg_get_functiondef(
    'public.get_guardian_live_route_overlays()'::regprocedure
  ) into v_definition;
  if position('current_guardian_id()' in v_definition) = 0
    or position('student_guardians' in v_definition) = 0
    or position('sg.status = ''active''' in v_definition) = 0 then
    raise exception 'Guardian geometry is not restricted to active links';
  end if;

  select pg_get_functiondef(
    'public.start_driver_trip_from_assignment(uuid)'::regprocedure
  ) into v_definition;
  if position('route_trip_pattern_id' in v_definition) = 0
    or position('trip_name_snapshot' in v_definition) = 0
    or position('p_assignment_id' in v_definition) = 0 then
    raise exception 'Trip start is not deriving the named pattern from the assignment';
  end if;

  if has_function_privilege('anon', 'public.admin_save_route_definition(jsonb,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_admin_live_route_overlays()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_guardian_live_route_overlays()', 'EXECUTE') then
    raise exception 'Anonymous route/trip RPC execution is exposed';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.calculate_safe_route_eta(uuid,uuid,uuid,double precision,double precision,double precision,timestamp with time zone)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.calculate_safe_route_eta(uuid,uuid,text,double precision,double precision,double precision,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Internal ETA helpers are exposed for arbitrary route IDs';
  end if;
  if has_table_privilege('anon', 'public.route_trip_patterns', 'SELECT')
    or has_table_privilege('anon', 'public.route_trip_stop_schedules', 'SELECT') then
    raise exception 'Anonymous route/trip table reads are exposed';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.student_bus_assignments'::regclass
      and tgname = 'validate_student_trip_stop_order'
      and not tgisinternal
  ) then
    raise exception 'Direction-aware student stop validation is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.route_trip_patterns'::regclass
      and tgname = 'enforce_route_trip_pattern_identity'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.route_trip_patterns'::regclass
      and tgname = 'validate_route_trip_pattern_pair_on_pattern'
      and tgdeferrable
      and not tgisinternal
  ) then
    raise exception 'Immutable two-direction trip pattern invariants are missing';
  end if;
end $$;
