-- Existing-database authorization checks. No fixtures or persistent writes.
-- READ ONLY is enforced by PostgreSQL, including inside called functions.
-- A failure raises an exception; the client must discard/rollback the transaction.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'FAIL: anonymous role/identity simulation';
  end if;
  begin
    perform public.get_guardian_bus_visibility_v2();
    raise exception 'FAIL: anonymous visibility RPC was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_guardian_bus_service_lines('SAFEBUS-READONLY-CHECK');
    raise exception 'FAIL: anonymous service-line RPC was not denied';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if current_user <> 'authenticated' or auth.uid() is not null then
    raise exception 'FAIL: authenticated role without subject simulation';
  end if;
  if exists (select 1 from public.get_guardian_bus_visibility_v2()) then
    raise exception 'FAIL: missing identity returned guardian data';
  end if;
  begin
    perform public.get_guardian_bus_service_lines('SAFEBUS-READONLY-CHECK');
    raise exception 'FAIL: missing identity service-line access was not denied';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'PASS' as result,
  4 as behavioral_assertions,
  'Anonymous RPC denial and authenticated-role missing-identity denial' as coverage;
rollback;
