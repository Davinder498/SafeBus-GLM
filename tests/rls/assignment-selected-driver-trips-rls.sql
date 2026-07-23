-- Assignment-selected driver trips security and exact-pattern regression checks.
-- Apply migration 0054 before running this file against hosted Supabase DEV.
begin;

do $$
declare
  v_assignments_def text;
  v_start_def text;
  v_manifest_def text;
  v_event_def text;
  v_qr_def text;
  v_guardian_location_def text;
  v_guardian_trip_def text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'driver_trips'
      and column_name = 'driver_route_assignment_id'
  ) then
    raise exception 'TEST FAILED: driver_trips assignment identity is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'driver_trips'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) like '%driver_route_assignment_id%driver_route_assignments%'
  ) then
    raise exception 'TEST FAILED: driver_trips assignment foreign key is missing';
  end if;

  if to_regprocedure('public.get_current_driver_trip_assignments()') is null
    or to_regprocedure('public.start_driver_trip_from_assignment(uuid)') is null then
    raise exception 'TEST FAILED: assignment-selected driver RPC contract is missing';
  end if;

  if has_function_privilege('public', 'public.get_current_driver_trip_assignments()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_current_driver_trip_assignments()', 'EXECUTE')
    or has_function_privilege('public', 'public.start_driver_trip_from_assignment(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.start_driver_trip_from_assignment(uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: assignment-selected driver RPC is exposed anonymously';
  end if;

  if not has_function_privilege('authenticated', 'public.get_current_driver_trip_assignments()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.start_driver_trip_from_assignment(uuid)', 'EXECUTE') then
    raise exception 'TEST FAILED: authenticated driver RPC execution is missing';
  end if;

  if has_table_privilege('authenticated', 'public.driver_trips', 'INSERT') then
    raise exception 'TEST FAILED: authenticated direct driver_trips inserts are allowed';
  end if;

  if to_regclass('public.driver_trips_driver_active_unique') is null
    or to_regclass('public.driver_trips_bus_active_unique') is null then
    raise exception 'TEST FAILED: one-active-trip driver or bus constraint is missing';
  end if;

  select lower(pg_get_functiondef('public.get_current_driver_trip_assignments()'::regprocedure))
    into v_assignments_def;
  if position('dra.driver_id = v_driver_id' in v_assignments_def) = 0
    or position('dra.tenant_id = v_tenant_id' in v_assignments_def) = 0
    or position('bra.route_trip_pattern_id = dra.route_trip_pattern_id' in v_assignments_def) = 0
    or position('dra.effective_from' in v_assignments_def) = 0
    or position('dra.effective_to' in v_assignments_def) = 0 then
    raise exception 'TEST FAILED: assignment list lacks ownership, date, or exact-pattern checks';
  end if;

  select lower(pg_get_functiondef('public.start_driver_trip_from_assignment(uuid)'::regprocedure))
    into v_start_def;
  if position('p_assignment_id' in v_start_def) = 0
    or position('v_assignment.driver_id <> v_driver_id' in v_start_def) = 0
    or position('v_assignment.tenant_id <> v_tenant_id' in v_start_def) = 0
    or position('you already have an active trip. end it before starting another.' in v_start_def) = 0
    or position('dt.bus_id = v_assignment.bus_id' in v_start_def) = 0
    or position('bra.route_trip_pattern_id = v_assignment.route_trip_pattern_id' in v_start_def) = 0
    or position('driver_route_assignment_id' in v_start_def) = 0 then
    raise exception 'TEST FAILED: trip start lacks exact assignment, concurrency, or pattern enforcement';
  end if;

  select lower(pg_get_functiondef('public.get_driver_active_trip_student_manifest()'::regprocedure))
    into v_manifest_def;
  select lower(pg_get_functiondef('public.record_student_trip_event_for_active_trip(uuid,text)'::regprocedure))
    into v_event_def;
  select lower(pg_get_functiondef('public.resolve_student_qr_for_active_trip(text)'::regprocedure))
    into v_qr_def;
  select lower(pg_get_functiondef('public.get_guardian_student_live_bus_location_state()'::regprocedure))
    into v_guardian_location_def;
  select lower(pg_get_functiondef('public.get_guardian_live_trip_visibility()'::regprocedure))
    into v_guardian_trip_def;

  if position('student_bus_assignments' in v_manifest_def) = 0
    or position('route_trip_pattern_id' in v_manifest_def) = 0
    or position('student_route_assignments' in v_manifest_def) > 0
    or position('student_bus_assignments' in v_event_def) = 0
    or position('route_trip_pattern_id' in v_event_def) = 0
    or position('student_route_assignments' in v_event_def) > 0
    or position('student_bus_assignments' in v_qr_def) = 0
    or position('route_trip_pattern_id' in v_qr_def) = 0
    or position('student_route_assignments' in v_qr_def) > 0
    or position('student_bus_assignments' in v_guardian_location_def) = 0
    or position('dt.route_trip_pattern_id = bra.route_trip_pattern_id' in v_guardian_location_def) = 0
    or position('student_route_assignments' in v_guardian_location_def) > 0
    or position('student_bus_assignments' in v_guardian_trip_def) = 0
    or position('dt.route_trip_pattern_id = bra.route_trip_pattern_id' in v_guardian_trip_def) = 0
    or position('student_route_assignments' in v_guardian_trip_def) > 0 then
    raise exception 'TEST FAILED: operational student or guardian visibility is not exact-pattern/fail-closed';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_current_driver_trip_assignments();
    raise exception 'TEST FAILED: anonymous assignment read was not denied';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.start_driver_trip_from_assignment(gen_random_uuid());
    raise exception 'TEST FAILED: anonymous assignment start was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
