-- Read-only post-release acceptance. Does not apply migration 0122 or create
-- fixtures. Run only after reviewed adoption/release; no customer data returned.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

do $$
begin
  if to_regprocedure('public.bus_service_entities_in_tenant(uuid,uuid,uuid)') is not null then
    raise exception 'FAIL: internal bus membership helper remains exposed';
  end if;
  if has_function_privilege('anon', 'safebus_private.bus_service_entities_in_tenant(uuid,uuid,uuid)', 'execute') then
    raise exception 'FAIL: anonymous membership helper execution';
  end if;
  if has_column_privilege('authenticated', 'public.student_guardians', 'admin_note', 'select')
     or has_column_privilege('authenticated', 'public.student_guardians', 'status_comment', 'select') then
    raise exception 'FAIL: private guardian notes are readable through REST';
  end if;
  if not has_column_privilege('authenticated', 'public.student_guardians', 'student_id', 'select') then
    raise exception 'FAIL: safe guardian relationship columns inaccessible';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      and not exists (
        select 1 from pg_policy p where p.polrelid = c.oid
          and p.polname = 'safebus_active_session' and not p.polpermissive
          and p.polcmd = '*'
      )
  ) then raise exception 'FAIL: missing restrictive session policy'; end if;
  if (select count(*) from pg_policy p
      where p.polrelid in ('public.driver_trip_current_locations'::regclass,
                          'public.driver_trip_location_updates'::regclass)
        and p.polname = 'safebus_school_location_scope'
        and not p.polpermissive and p.polcmd = 'r') <> 2 then
    raise exception 'FAIL: school location restrictions missing';
  end if;
  if not exists (
    select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator'
      and 'pgrst.db_pre_request=safebus_private.enforce_active_api_session' = any(s.setconfig)
  ) then raise exception 'FAIL: PostgREST session hook missing'; end if;
end $$;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.is_current_user_session_active() then
    raise exception 'FAIL: session without subject accepted';
  end if;
  begin
    perform public.get_admin_student_guardian_links('00000000-0000-0000-0000-000000000000');
    raise exception 'FAIL: missing identity returned administrator notes';
  exception when insufficient_privilege then null; end;
  begin
    perform public.check_rate_limit('invitation', '00000000-0000-0000-0000-000000000000', 10, 60);
    raise exception 'FAIL: unauthenticated rate-limit write permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A syntactically valid subject with malformed session claims must fail closed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","session_id":"invalid"}', true);
set local role authenticated;
do $$
begin
  if public.is_current_user_session_active() then
    raise exception 'FAIL: malformed session ID accepted';
  end if;
  perform set_config('request.path', '/rpc/get_admin_student_guardian_links', true);
  perform set_config('request.method', 'POST', true);
  begin
    perform safebus_private.enforce_active_api_session();
    raise exception 'FAIL: inactive API session accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.path', '/rpc/is_current_user_session_active', true);
  perform safebus_private.enforce_active_api_session();
end $$;
reset role;
select 'PASS' as result,
  'Security catalog, missing identity, malformed session and API denial checks; positive role/tenant scenarios still required' as coverage;
rollback;
