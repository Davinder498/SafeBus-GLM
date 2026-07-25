-- Administrative trip overview authorization, privacy, and tenant isolation assertions.
begin;

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.get_admin_trip_overview(integer)') is null then
    raise exception 'TEST FAILED: admin trip overview RPC is missing';
  end if;
  if has_function_privilege('public', 'public.get_admin_trip_overview(integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_admin_trip_overview(integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: admin trip overview is exposed anonymously';
  end if;
  if not has_function_privilege('authenticated', 'public.get_admin_trip_overview(integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: authenticated execute grant is missing';
  end if;

  select lower(pg_get_functiondef('public.get_admin_trip_overview(integer)'::regprocedure)) into v_definition;
  if position('security definer' in v_definition) = 0
    or position('set search_path to ''public'', ''pg_temp''' in v_definition) = 0 then
    raise exception 'TEST FAILED: SECURITY DEFINER hardening is missing';
  end if;
  if position('dt.tenant_id = v_tenant_id' in v_definition) = 0
    or position('r.tenant_id = dt.tenant_id' in v_definition) = 0
    or position('rtp.tenant_id = dt.tenant_id' in v_definition) = 0
    or position('b.tenant_id = dt.tenant_id' in v_definition) = 0
    or position('d.tenant_id = dt.tenant_id' in v_definition) = 0
    or position('p.tenant_id = dt.tenant_id' in v_definition) = 0 then
    raise exception 'TEST FAILED: a returned or joined record is not tenant scoped';
  end if;
  if position('''tenant_admin'', ''school_admin'', ''transportation_admin''' in v_definition) = 0
    or position('auth.uid() is null' in v_definition) = 0 then
    raise exception 'TEST FAILED: explicit administrator authorization is missing';
  end if;
  if position('dt.status in (''active'', ''completed'', ''cancelled'')' in v_definition) = 0
    or position('dt.ended_at' in v_definition) = 0 then
    raise exception 'TEST FAILED: canonical lifecycle statuses or end timestamps are missing';
  end if;
  if position('rtp.direction' in v_definition) = 0 or position('dt.trip_type' in v_definition) > 0 then
    raise exception 'TEST FAILED: direction must come from the route trip pattern';
  end if;
  if position('student' in v_definition) > 0 or position('guardian' in v_definition) > 0
    or position('location' in v_definition) > 0 or position('email' in v_definition) > 0
    or position('phone' in v_definition) > 0 then
    raise exception 'TEST FAILED: unsafe personal or location data is referenced';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_admin_trip_overview(10);
    raise exception 'TEST FAILED: anonymous trip overview call was not denied';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
