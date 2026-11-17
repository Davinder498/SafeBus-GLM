-- Recovery-only database authorization rehearsal. Every fixture and temporary
-- schema grant is rolled back. No login credentials, tokens, emails or jobs.
-- Use only through a connection bound to deladookciebwvqojhkv.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '60s';
set local request.jwt.claims = '{}';
set local request.path = '/tenants';
set local request.method = 'GET';

do $guard$
begin
  if not exists(select 1 from safebus_release.environment_identity
    where singleton and environment='staging'
      and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) then
    raise exception 'Recovery identity required';
  end if;
  if exists(select 1 from auth.users) or exists(select 1 from public.tenants)
    or exists(select 1 from public.profiles) or exists(select 1 from cron.job)
    or exists(select 1 from vault.secrets) or exists(select 1 from storage.objects) then
    raise exception 'Empty isolated fixture target required';
  end if;
  if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
    where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')) then
    raise exception 'Target must start quarantined';
  end if;
end $guard$;

-- This uncommitted grant is visible only to this transaction. RLS, table and
-- function privileges remain intact. No PUBLIC, anon or service_role grant.
grant usage on schema public, safebus_private to authenticated;

insert into public.tenants(id,name,type) values
 ('ca000000-0000-4000-8000-000000000001','Capacity Synthetic District A','demo'),
 ('ca000000-0000-4000-8000-000000000002','Capacity Synthetic District B','demo');

do $fixtures$
declare i integer; uid uuid; sid uuid; roles text[]:=array[
 'tenant_admin','transportation_admin','driver','guardian','platform_super_admin','tenant_admin','guardian'];
begin
 for i in 1..7 loop
  uid:=('ca100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  sid:=('ca200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  insert into auth.users(id,email,aud,role,created_at,updated_at)
    values(uid,'capacity-role-'||i||'@example.test','authenticated','authenticated',now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at,not_after,aal)
    values(sid,uid,now(),now(),now()+interval '10 minutes','aal2');
  insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role,status)
    values(uid,case when i=5 then null when i<=4 then 'ca000000-0000-4000-8000-000000000001'::uuid
      else 'ca000000-0000-4000-8000-000000000002'::uuid end,
      'Synthetic Role','Synthetic','Role','capacity-role-'||i||'@example.test',roles[i]::public.user_role,'active');
 end loop;
 -- The retired role must fail before a profile can be created. This exception
 -- block rolls back only its attempted insert; it does not suppress other errors.
 begin
  insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role)
    values('ca100000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001',
      'Retired Role','Retired','Role','retired@example.test','school_admin');
  raise exception 'Retired school admin unexpectedly accepted';
 exception when insufficient_privilege then null;
 end;
end $fixtures$;

do $checks$
declare i integer; uid uuid; sid uuid; expected_tenant uuid; n integer; actual_role text;
 roles text[]:=array['tenant_admin','transportation_admin','driver','guardian','platform_super_admin','tenant_admin','guardian'];
begin
 for i in 1..7 loop
  uid:=('ca100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  sid:=('ca200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  expected_tenant:=case when i=5 then null when i<=4 then 'ca000000-0000-4000-8000-000000000001'::uuid
    else 'ca000000-0000-4000-8000-000000000002'::uuid end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,
    'role','authenticated','aal','aal2','user_metadata',jsonb_build_object('role','platform_super_admin'))::text,true);
  execute 'set local role authenticated';
  perform safebus_private.enforce_active_api_session();
  if not public.is_current_user_session_active() then raise exception 'Valid fixture session denied'; end if;
  actual_role:=safebus_private.current_user_role()::text;
  if actual_role is distinct from roles[i] then raise exception 'Role lookup or metadata isolation failed'; end if;
  if safebus_private.current_tenant_id() is distinct from expected_tenant then raise exception 'Tenant identity mismatch'; end if;
  select count(*) into n from public.tenants;
  if n <> (case when i=5 then 2 else 1 end) then raise exception 'Tenant visibility mismatch'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'Own profile not visible'; end if;
  if i<>5 and exists(select 1 from public.profiles where tenant_id is distinct from expected_tenant) then
    raise exception 'Cross-tenant profile leak';
  end if;
  execute 'reset role';

  -- No enrolled MFA for these synthetic users: guardian/driver aal1 works,
  -- while privileged roles cannot read tenant data without aal2.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  select count(*) into n from public.tenants;
  if n <> (case when roles[i] in ('driver','guardian') then 1 else 0 end) then raise exception 'MFA policy mismatch'; end if;
  if roles[i] in ('driver','guardian') then
    perform safebus_private.enforce_active_api_session();
  else
    begin
      perform safebus_private.enforce_active_api_session();
      raise exception 'API hook accepted privileged aal1 session';
    exception when insufficient_privilege then null; end;
  end if;
  execute 'reset role';

  -- A missing session must not grant access.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',
    'ca200000-0000-4000-8000-000000000099','role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  begin
    perform safebus_private.enforce_active_api_session();
    raise exception 'API hook accepted invalid session';
  exception when insufficient_privilege then null; end;
  if public.is_current_user_session_active() or exists(select 1 from public.tenants)
    or exists(select 1 from public.profiles) then raise exception 'Missing session accepted'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',
    case when i=1 then 'ca200000-0000-4000-8000-000000000002' else 'ca200000-0000-4000-8000-000000000001' end,
    'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  begin
    perform safebus_private.enforce_active_api_session();
    raise exception 'API hook accepted invalid session';
  exception when insufficient_privilege then null; end;
  if public.is_current_user_session_active() or exists(select 1 from public.tenants)
    or exists(select 1 from public.profiles) then raise exception 'Other user session accepted'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  update auth.sessions set not_after=now()-interval '1 minute' where id=sid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  begin
    perform safebus_private.enforce_active_api_session();
    raise exception 'API hook accepted invalid session';
  exception when insufficient_privilege then null; end;
  if public.is_current_user_session_active() or exists(select 1 from public.tenants)
    or exists(select 1 from public.profiles) then raise exception 'Expired session accepted'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  update auth.sessions set not_after=now()+interval '10 minutes' where id=sid;
 end loop;
 perform set_config('request.jwt.claims','{}',true);
end $checks$;
rollback;

-- Successful execution must leave both data and schema-access quarantine intact.
do $cleanup$
begin
 if exists(select 1 from auth.users) or exists(select 1 from auth.sessions)
   or exists(select 1 from public.tenants) or exists(select 1 from public.profiles)
   or exists(select 1 from safebus_private.participant_agreement_requirements)
   or exists(select 1 from safebus_private.tenant_agreement_requirement)
   or exists(select 1 from public.guardian_notification_delivery_policies) then
   raise exception 'Fixture rollback incomplete';
 end if;
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
   where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')) then
   raise exception 'Schema quarantine changed';
 end if;
end $cleanup$;
select 'passed' as recovery_role_rehearsal, 7 as synthetic_identities, false as persisted_accounts,
 false as login_verified, false as capacity_verified;
