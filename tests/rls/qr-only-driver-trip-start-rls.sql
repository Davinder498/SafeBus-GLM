-- QR-only driver trip start structural and privilege regression checks.
-- Apply migration 0062 after the preceding migrations before running this
-- file against hosted Supabase DEV.
begin;

do $$
declare
  v_qr_start_definition text;
begin
  if to_regprocedure('public.start_bus_tracking_from_qr(text)') is null then
    raise exception 'TEST FAILED: QR bus start RPC is missing';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.start_driver_trip_from_assignment(uuid)',
      'EXECUTE'
    ) or has_function_privilege(
      'authenticated',
      'public.get_current_driver_trip_assignments()',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: legacy driver assignment-start browser path remains executable';
  end if;

  if has_function_privilege('public', 'public.start_bus_tracking_from_qr(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.start_bus_tracking_from_qr(text)', 'EXECUTE')
    or not has_function_privilege(
      'authenticated',
      'public.start_bus_tracking_from_qr(text)',
      'EXECUTE'
    ) then
    raise exception 'TEST FAILED: QR bus start execute privileges are incorrect';
  end if;

  if has_table_privilege('authenticated', 'public.driver_trips', 'INSERT') then
    raise exception 'TEST FAILED: authenticated users can insert driver trips directly';
  end if;

  select lower(pg_get_functiondef('public.start_bus_tracking_from_qr(text)'::regprocedure))
    into v_qr_start_definition;

  if position('security definer' in v_qr_start_definition) = 0
    or position('current_user_role() <> ''driver''' in v_qr_start_definition) = 0
    or position('current_driver_id()' in v_qr_start_definition) = 0
    or position('d.status = ''active''' in v_qr_start_definition) = 0
    or position('hash_bus_tracking_token(p_qr_token)' in v_qr_start_definition) = 0
    or position('d.status = ''ready''' in v_qr_start_definition) = 0
    or position('v_dispatch.route_trip_pattern_id' in v_qr_start_definition) = 0
    or position('insert into public.bus_tracking_sessions' in v_qr_start_definition) = 0
    or position('session_token_hash' in v_qr_start_definition) = 0 then
    raise exception 'TEST FAILED: QR start lacks active-driver, credential, prepared-run, exact-pattern, or GPS-session enforcement';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.start_bus_tracking_from_qr('sbus_bus_v1_' || repeat('A', 43));
    raise exception 'TEST FAILED: anonymous QR bus start was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
