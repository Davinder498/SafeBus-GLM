-- Read-only verification of existing identities, sessions and reporting sources.
-- No fixtures, production student reads, schema changes or provider calls.
begin transaction read only;
set local statement_timeout = '8s';
set local lock_timeout = '1s';

do $check$
declare
  actor record;
  session_id uuid;
  allowed boolean;
  coverage jsonb := '[]'::jsonb;
begin
  for actor in
    select distinct on (p.role,p.tenant_id) p.id,p.role,p.tenant_id
    from public.profiles p
    left join public.tenants t on t.id=p.tenant_id
    where p.status='active' and (p.role='platform_super_admin' or t.status='active')
    order by p.role,p.tenant_id,p.id limit 12
  loop
    select s.id into session_id from auth.sessions s
      where s.user_id=actor.id and (s.not_after is null or s.not_after>now())
      and not exists(select 1 from public.user_sessions us where us.id=s.id and us.revoked_at is not null)
      order by s.created_at desc limit 1;
    if session_id is null then
      coverage := coverage || jsonb_build_array(jsonb_build_object('role',actor.role,'result','no existing active session; skipped'));
      continue;
    end if;
    perform set_config('request.jwt.claim.sub',actor.id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated',
      'session_id',session_id,'aal','aal2','amr',jsonb_build_array(jsonb_build_object(
        'method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
    execute 'set local role authenticated';
    allowed := actor.role in ('tenant_admin','transportation_admin');
    if allowed then
      if public.get_admin_trip_detail('00000000-0000-0000-0000-000000000000') is not null then
        raise exception 'Authorization probe UUID unexpectedly exists';
      end if;
      if exists(select 1 from public.trip_exceptions where tenant_id<>actor.tenant_id limit 1)
        or exists(select 1 from public.trip_operational_statuses where tenant_id<>actor.tenant_id limit 1)
        or exists(select 1 from public.driver_trips where tenant_id<>actor.tenant_id limit 1) then
        raise exception 'Reporting source escaped authority RLS';
      end if;
      -- The existing trip RPC must reject administrators without verified MFA.
      perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated',
        'session_id',session_id,'aal','aal1')::text,true);
      begin
        perform public.get_admin_trip_detail('00000000-0000-0000-0000-000000000000');
        raise exception 'Reporting authorization probe accepted administrator without MFA';
      exception when insufficient_privilege then null;
      end;
    else
      begin
        perform public.get_admin_trip_detail('00000000-0000-0000-0000-000000000000');
        raise exception 'Non-reporting role accepted by authorization probe';
      exception when insufficient_privilege then null;
      end;
    end if;
    execute 'reset role';
    coverage := coverage || jsonb_build_array(jsonb_build_object('role',actor.role,'result','passed existing-role checks'));
  end loop;
  perform set_config('safebus.qa.reporting_coverage',coverage::text,true);
end;
$check$;
select current_setting('safebus.qa.reporting_coverage')::jsonb as existing_identity_coverage;
rollback;
