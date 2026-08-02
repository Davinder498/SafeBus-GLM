-- QR-paired bus tracking session security regression checks.
-- Apply migration 0059 before running this file against hosted Supabase DEV.
begin;

do $$
declare
  v_start_definition text;
  v_update_definition text;
  v_prepare_definition text;
  v_function record;
  v_table_name text;
  v_generated_token text;
begin
  if length(public.hash_bus_tracking_token('crypto-resolution-check')) <> 64 then
    raise exception 'TEST FAILED: bus token hashing is unavailable';
  end if;
  v_generated_token := public.create_bus_qr_token();
  if v_generated_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'TEST FAILED: bus QR token generation is unavailable';
  end if;

  if to_regprocedure('public.protect_assigned_bus_number()') is null then
    raise exception 'TEST FAILED: stable bus-number protection is missing';
  end if;

  foreach v_table_name in array array[
    'bus_qr_credentials',
    'bus_run_dispatches',
    'bus_tracking_sessions'
  ] loop
    if to_regclass('public.' || v_table_name) is null then
      raise exception 'TEST FAILED: missing protected table %', v_table_name;
    end if;
    if not coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table_name
    ), false) then
      raise exception 'TEST FAILED: RLS is not enabled on %', v_table_name;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table_name, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table_name, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table_name, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table_name, 'DELETE') then
      raise exception 'TEST FAILED: authenticated has direct access to %', v_table_name;
    end if;
  end loop;

  for v_function in
    select * from (values
      ('public.manage_bus_qr_credential(uuid,text)'),
      ('public.get_admin_bus_qr_credential_status(uuid)'),
      ('public.prepare_bus_run(uuid)'),
      ('public.get_admin_bus_ready_dispatch(uuid)'),
      ('public.start_bus_tracking_from_qr(text)'),
      ('public.update_bus_tracking_location(text,double precision,double precision,double precision,double precision,double precision)')
    ) as functions(signature)
  loop
    if to_regprocedure(v_function.signature) is null then
      raise exception 'TEST FAILED: missing RPC %', v_function.signature;
    end if;
    if has_function_privilege('public', v_function.signature, 'EXECUTE')
      or has_function_privilege('anon', v_function.signature, 'EXECUTE') then
      raise exception 'TEST FAILED: anonymous execution is available for %', v_function.signature;
    end if;
    if not has_function_privilege('authenticated', v_function.signature, 'EXECUTE') then
      raise exception 'TEST FAILED: authenticated execution is missing for %', v_function.signature;
    end if;
  end loop;

  select lower(pg_get_functiondef('public.start_bus_tracking_from_qr(text)'::regprocedure))
    into v_start_definition;
  select lower(pg_get_functiondef(
    'public.update_bus_tracking_location(text,double precision,double precision,double precision,double precision,double precision)'::regprocedure
  )) into v_update_definition;
  select lower(pg_get_functiondef('public.prepare_bus_run(uuid)'::regprocedure))
    into v_prepare_definition;

  if position('current_user_role() <> ''driver''' in v_start_definition) = 0
    or position('d.status = ''active''' in v_start_definition) = 0
    or position('hash_bus_tracking_token(p_qr_token)' in v_start_definition) = 0
    or position('d.status = ''ready''' in v_start_definition) = 0
    or position('d.service_date = current_date' in v_start_definition) = 0
    or position('bra.route_trip_pattern_id = v_dispatch.route_trip_pattern_id' in v_start_definition) = 0 then
    raise exception 'TEST FAILED: QR start lacks active-driver, hashed-token, ready-run, or exact-pattern checks';
  end if;

  if position('c.status = ''active''' in lower(pg_get_functiondef(
    'public.manage_bus_qr_credential(uuid,text)'::regprocedure
  ))) = 0 then
    raise exception 'TEST FAILED: credential management does not qualify its status column';
  end if;

  if position('current_user_role() <> ''driver''' in v_update_definition) = 0
    or position('s.session_token_hash = v_hash' in v_update_definition) = 0
    or position('v_session.driver_id is distinct from public.current_driver_id()' in v_update_definition) = 0
    or position('v_session.expires_at <= now()' in v_update_definition) = 0
    or position('v_trip.bus_id' in v_update_definition) = 0 then
    raise exception 'TEST FAILED: location writes are not fully bound to the active session';
  end if;

  if position('is_transportation_write_admin()' in v_prepare_definition) = 0
    or position('bra.tenant_id = v_tenant_id' in v_prepare_definition) = 0
    or position('rtp.status = ''active''' in v_prepare_definition) = 0 then
    raise exception 'TEST FAILED: run preparation lacks admin, tenant, or active-pattern checks';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.start_bus_tracking_from_qr('sbus_bus_v1_' || repeat('A', 43));
    raise exception 'TEST FAILED: anonymous QR start was not denied';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.update_bus_tracking_location(
      'sbus_track_v1_' || repeat('A', 43), 53.5461, -113.4937, null, null, null
    );
    raise exception 'TEST FAILED: anonymous location update was not denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
