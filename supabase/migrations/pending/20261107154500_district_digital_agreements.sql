-- SafeBus digital MSA/DPA. PREPARED; NOT APPLIED. DO NOT ENABLE IN PRODUCTION.
-- Protected release must verify existing pre-request hook, current helper definitions,
-- all RLS/grants, and role-specific acceptance before applying this forward migration.
-- Existing tenants are expressly grandfathered; future tenants require activation.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if to_regclass('public.tenants') is null or to_regclass('public.profiles') is null
    or to_regprocedure('public.is_current_user_session_active()') is null
    or to_regprocedure('safebus_private.enforce_active_api_session()') is null
    or to_regprocedure('safebus_private.current_user_role()') is null
  then raise exception 'SafeBus hardened account/session baseline required' using errcode='55006';
  end if;
end $guard$;

-- Two statements ensure ALL EXISTING authorities remain exempt. Only future
-- public.tenants inserts default to pending-contract gate.
alter table public.tenants add column agreement_gate_required boolean;
update public.tenants set agreement_gate_required = false where agreement_gate_required is null;
alter table public.tenants alter column agreement_gate_required set default true;
alter table public.tenants alter column agreement_gate_required set not null;

create table safebus_private.district_agreement_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  revision integer not null check(revision between 1 and 9999),
  documents jsonb not null check(jsonb_typeof(documents)='array' and jsonb_array_length(documents)=8),
  bundle_sha256 text not null check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  business_approval_ref text not null check(business_approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'),
  status text not null check(status in ('issued','customer_signed','executed','active','superseded','withdrawn')),
  customer_signed_at timestamptz, customer_signer_name text, customer_signer_title text,
  provider_signed_at timestamptz, provider_signer_name text, provider_signer_title text,
  provider_authority_ref text,
  activated_at timestamptz, activation_refs jsonb,
  created_at timestamptz not null default now(), created_by uuid not null,
  unique (tenant_id,revision)
);
create unique index agreement_one_pending_per_tenant
  on safebus_private.district_agreement_packages(tenant_id)
  where status in ('issued','customer_signed','executed');
create unique index agreement_one_active_per_tenant
  on safebus_private.district_agreement_packages(tenant_id) where status='active';
create index agreement_packages_tenant_created
  on safebus_private.district_agreement_packages(tenant_id,created_at desc);

create table safebus_private.district_agreement_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  package_id uuid not null references safebus_private.district_agreement_packages(id) on delete restrict,
  signer_name text not null check(length(trim(signer_name)) between 2 and 160),
  signer_title text not null check(length(trim(signer_title)) between 2 and 120),
  signer_email text not null check(signer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(signer_email)<=254),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  status text not null check(status in ('requested','verified','invited','signed','revoked','declined')),
  authority_ref text check(authority_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  token_sha256 text unique check(token_sha256 ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  token_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index district_agreement_signers_package
  on safebus_private.district_agreement_signers(package_id,created_at desc);

create table safebus_private.district_agreement_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  package_id uuid not null references safebus_private.district_agreement_packages(id) on delete restrict,
  signer_id uuid references safebus_private.district_agreement_signers(id) on delete restrict,
  event_type text not null check(event_type in (
    'package_issued','signer_requested','authority_verified','invitation_issued',
    'invitation_revoked','customer_signed','provider_signed','package_activated')),
  actor_profile_id uuid,
  occurred_at timestamptz not null default now(),
  bundle_sha256 text not null,
  detail jsonb not null default '{}'::jsonb
);
create index district_agreement_events_package on safebus_private.district_agreement_events(package_id,occurred_at,id);

-- No direct Data API access to contract, signer or event rows.
alter table safebus_private.district_agreement_packages enable row level security;
alter table safebus_private.district_agreement_signers enable row level security;
alter table safebus_private.district_agreement_events enable row level security;
revoke all on table safebus_private.district_agreement_packages,
  safebus_private.district_agreement_signers,
  safebus_private.district_agreement_events from public,anon,authenticated;
revoke all on schema safebus_private from public,anon;

-- Every function in this migration checks active JWT session + MFA and
-- the actual persisted caller profile, rather than client-supplied role claims.
create function safebus_private.district_contract_actor(p_role public.user_role)
returns uuid language plpgsql stable security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_current_user_session_active()
    or coalesce(auth.jwt()->>'aal','') <> 'aal2'
    or not exists(select 1 from public.profiles p where p.id=v_user
        and p.status='active' and p.role=p_role and
        (p_role='platform_super_admin' or exists
          (select 1 from public.tenants t where t.id=p.tenant_id and t.status='active')))
  then raise exception 'Agreement action requires active authorized MFA session' using errcode='42501';
  end if;
  return v_user;
end $$;
revoke all on function safebus_private.district_contract_actor(public.user_role) from public,anon,authenticated;

create function safebus_private.district_contract_access_allowed()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
  select coalesce((
    select case
      when p.role = 'platform_super_admin' then true
      when not t.agreement_gate_required then true
      else exists(select 1 from safebus_private.district_agreement_packages a
         where a.tenant_id=p.tenant_id and a.status='active')
      end
    from public.profiles p left join public.tenants t on t.id=p.tenant_id
    where p.id=auth.uid() and p.status='active'
    limit 1
  ),false);
$$;
revoke all on function safebus_private.district_contract_access_allowed() from public,anon;
grant execute on function safebus_private.district_contract_access_allowed() to authenticated,service_role;

-- Secure privileged role helpers, including Realtime policy callers, for
-- gated NEW districts. The existing sessions and tenant-status checks stay.
create or replace function safebus_private.current_user_role()
returns public.user_role language sql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp
as $$
  select p.role from public.profiles p
  left join public.tenants t on t.id=p.tenant_id
  where p.id=auth.uid() and p.status='active'
    and p.role::text <> 'school_admin'
    and (p.role='platform_super_admin' or t.status='active')
    and public.is_current_user_session_active()
    and safebus_private.district_contract_access_allowed()
  limit 1;
$$;
create or replace function safebus_private.current_tenant_id()
returns uuid language sql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp
as $$
  select p.tenant_id from public.profiles p
  join public.tenants t on t.id=p.tenant_id and t.status='active'
  where p.id=auth.uid() and p.status='active'
    and public.is_current_user_session_active()
    and safebus_private.district_contract_access_allowed()
  limit 1;
$$;

-- Closed to every public table/Data API or PostgREST RPC for unapproved
-- newly invited authorities except the exact account-authentication actions
-- and the agreement endpoints below. Session gating always runs first.
create or replace function safebus_private.enforce_active_api_session()
returns void language plpgsql security invoker
set search_path=pg_catalog,public,auth,safebus_private,pg_temp
as $$
declare v_path text := ltrim(current_setting('request.path',true),'/');
        v_method text := current_setting('request.method',true);
begin
  if auth.role() = 'service_role' then return; end if;
  if v_path='rpc/is_current_user_session_active' and v_method in ('GET','HEAD','POST') then return; end if;
  if not public.is_current_user_session_active() then
    raise exception 'An active SafeBus session is required.' using errcode='42501';
  end if;
  if auth.uid() is not null
    and not safebus_private.district_contract_access_allowed()
    and exists(select 1 from public.profiles p join public.tenants t on t.id=p.tenant_id
      where p.id=auth.uid() and p.status='active' and t.agreement_gate_required)
  then
    if (v_path='profiles' and v_method in ('GET','HEAD'))
      or (v_path in (
        'rpc/register_current_user_session','rpc/record_own_auth_event',
        'rpc/enforce_new_password_policy','rpc/complete_invited_account',
        'rpc/get_district_agreement_status_secure','rpc/request_district_agreement_signer'
      ) and v_method in ('GET','HEAD','POST')) then return; end if;
    raise exception 'Finish the district agreement before accessing SafeBus operations.'
      using errcode='42501';
  end if;
end $$;
revoke all on function safebus_private.enforce_active_api_session() from public,anon;
grant execute on function safebus_private.enforce_active_api_session() to authenticated,service_role;

-- Defense in depth for Realtime and policies that don't use the role helpers.
-- Auth/profile and session tables remain available for login/MFA setup.
do $rls$
declare v_table record;
begin
  for v_table in
    select n.nspname,c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and c.relrowsecurity
      and c.relname not in ('profiles','user_sessions')
  loop
    execute format('create policy safebus_district_contract_gate on %I.%I as restrictive
      for all to authenticated
      using ((select safebus_private.district_contract_access_allowed()))
      with check ((select safebus_private.district_contract_access_allowed()))',
      v_table.nspname,v_table.relname);
  end loop;
end $rls$;

create function public.get_district_agreement_status_secure(p_tenant_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid; v_tenant uuid; v_package record; v_signers jsonb;
begin
  if p_tenant_id is not null then
    v_actor:=safebus_private.district_contract_actor('platform_super_admin');
    v_tenant:=p_tenant_id;
  else
    v_actor:=safebus_private.district_contract_actor('tenant_admin');
    select p.tenant_id into v_tenant from public.profiles p where p.id=v_actor;
  end if;
  if v_tenant is null then raise exception 'Agreement tenant unavailable' using errcode='42501'; end if;
  select a.* into v_package from safebus_private.district_agreement_packages a
   where a.tenant_id=v_tenant and a.status not in ('superseded','withdrawn')
   order by a.revision desc limit 1;
  if v_package.id is null then
    return jsonb_build_object('state','awaiting_documents','tenantId',v_tenant,
      'required',(select agreement_gate_required from public.tenants where id=v_tenant));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.signer_name,'title',s.signer_title,
    'email',s.signer_email,'status',s.status,'authorityVerified',s.verified_at is not null)
    order by s.created_at desc),'[]'::jsonb) into v_signers
  from safebus_private.district_agreement_signers s where s.package_id=v_package.id;
  return jsonb_build_object(
    'state',v_package.status,'tenantId',v_tenant,'packageId',v_package.id,
    'revision',v_package.revision,'bundleHash',v_package.bundle_sha256,
    'documents',v_package.documents,'signers',v_signers,
    'customerSignedAt',v_package.customer_signed_at,
    'providerSignedAt',v_package.provider_signed_at,
    'activatedAt',v_package.activated_at,
    'required',(select agreement_gate_required from public.tenants where id=v_tenant)
  );
end $$;
revoke all on function public.get_district_agreement_status_secure(uuid) from public,anon;
grant execute on function public.get_district_agreement_status_secure(uuid) to authenticated;

-- Document list is fixed by SafeBus's negotiated agreement pack; no unsigned
-- placeholders, null strings, unknown kinds or arbitrary client-provided URLs.
create function public.platform_issue_district_agreement(
 p_tenant_id uuid,p_documents jsonb,p_business_approval_ref text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid; v_kind text; v_doc jsonb; v_hash text; v_id uuid; v_revision integer;
begin
  v_actor:=safebus_private.district_contract_actor('platform_super_admin');
  if p_tenant_id is null or not exists(select 1 from public.tenants where id=p_tenant_id and agreement_gate_required)
    or p_business_approval_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'
    or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents)<>8
  then raise exception 'Incomplete district contract approval' using errcode='22023'; end if;
  if exists(select 1 from safebus_private.district_agreement_packages
    where tenant_id=p_tenant_id and status in ('customer_signed','executed'))
  then raise exception 'Previously signed contract must be resolved separately' using errcode='55006'; end if;
  foreach v_kind in array array['msa','dpa','order','security','sla','acceptable_use','return','suppliers']
  loop
    if (select count(*) from jsonb_array_elements(p_documents) j where j->>'kind'=v_kind)<>1
    then raise exception 'Required contract document missing or duplicate' using errcode='22023'; end if;
  end loop;
  for v_doc in select value from jsonb_array_elements(p_documents) loop
    if jsonb_typeof(v_doc) <> 'object'
       or length(coalesce(v_doc->>'title','')) not between 3 and 120
       or length(coalesce(v_doc->>'body','')) not between 200 and 50000
       or length(coalesce(v_doc->>'version','')) not between 1 and 40
       or (v_doc->>'body') ~ '\[[A-Z][A-Z0-9_]{2,}\]'
    then raise exception 'Document text or version is incomplete' using errcode='22023'; end if;
  end loop;
  if length(p_documents::text)>220000
  then raise exception 'Contract package exceeds reviewed size limit' using errcode='22023'; end if;
  select coalesce(max(revision),0)+1 into v_revision
    from safebus_private.district_agreement_packages where tenant_id=p_tenant_id;
  update safebus_private.district_agreement_packages
    set status='superseded'
    where tenant_id=p_tenant_id and status='issued';
  v_hash:=encode(digest(convert_to(p_documents::text,'UTF8'),'sha256'),'hex');
  insert into safebus_private.district_agreement_packages(
    tenant_id,revision,documents,bundle_sha256,business_approval_ref,status,created_by)
    values(p_tenant_id,v_revision,p_documents,v_hash,p_business_approval_ref,'issued',v_actor)
    returning id into v_id;
  insert into safebus_private.district_agreement_events(tenant_id,package_id,event_type,actor_profile_id,bundle_sha256)
    values(p_tenant_id,v_id,'package_issued',v_actor,v_hash);
  return jsonb_build_object('state','issued','packageId',v_id,'revision',v_revision,'bundleHash',v_hash);
end $$;
revoke all on function public.platform_issue_district_agreement(uuid,jsonb,text) from public,anon;
grant execute on function public.platform_issue_district_agreement(uuid,jsonb,text) to authenticated;

create function public.request_district_agreement_signer(
  p_signer_name text,p_signer_title text,p_signer_email text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid;v_tenant uuid;v_pkg record;v_id uuid;
begin
  v_actor:=safebus_private.district_contract_actor('tenant_admin');
  select tenant_id into v_tenant from public.profiles where id=v_actor;
  if length(trim(coalesce(p_signer_name,''))) not between 2 and 160
     or length(trim(coalesce(p_signer_title,''))) not between 2 and 120
     or length(trim(coalesce(p_signer_email,''))) not between 5 and 254
     or trim(coalesce(p_signer_email,'')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'Invalid signing officer details' using errcode='22023'; end if;
  select * into v_pkg from safebus_private.district_agreement_packages
    where tenant_id=v_tenant and status='issued'
    order by revision desc limit 1 for update;
  if v_pkg.id is null then raise exception 'An approved package is not ready to sign' using errcode='55006'; end if;
  if exists(select 1 from safebus_private.district_agreement_signers
     where package_id=v_pkg.id and requested_by=v_actor and created_at>now()-interval '30 minutes')
  then raise exception 'A signing request was already submitted recently' using errcode='55006'; end if;
  insert into safebus_private.district_agreement_signers(
    tenant_id,package_id,signer_name,signer_title,signer_email,requested_by,status)
  values(v_tenant,v_pkg.id,trim(p_signer_name),trim(p_signer_title),
    lower(trim(p_signer_email)),v_actor,'requested') returning id into v_id;
  insert into safebus_private.district_agreement_events(tenant_id,package_id,signer_id,
    event_type,actor_profile_id,bundle_sha256)
  values(v_tenant,v_pkg.id,v_id,'signer_requested',v_actor,v_pkg.bundle_sha256);
  return jsonb_build_object('state','requested','requestId',v_id);
end $$;
revoke all on function public.request_district_agreement_signer(text,text,text) from public,anon;
grant execute on function public.request_district_agreement_signer(text,text,text) to authenticated;

create function public.platform_verify_district_signer(
  p_signer_id uuid,p_authority_ref text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid;v_s record;v_p record;
begin
  v_actor:=safebus_private.district_contract_actor('platform_super_admin');
  if coalesce(p_authority_ref,'') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'
  then raise exception 'Signing authority evidence reference required' using errcode='22023'; end if;
  select * into v_s from safebus_private.district_agreement_signers
   where id=p_signer_id for update;
  select * into v_p from safebus_private.district_agreement_packages
   where id=v_s.package_id and status='issued';
  if v_s.id is null or v_s.status<>'requested' or v_p.id is null
  then raise exception 'Signing request is no longer verifiable' using errcode='55006'; end if;
  update safebus_private.district_agreement_signers
    set status='verified',authority_ref=p_authority_ref,verified_by=v_actor,verified_at=now()
    where id=v_s.id;
  insert into safebus_private.district_agreement_events(tenant_id,package_id,signer_id,
    event_type,actor_profile_id,bundle_sha256)
    values(v_s.tenant_id,v_s.package_id,v_s.id,'authority_verified',v_actor,v_p.bundle_sha256);
  return jsonb_build_object('state','verified','requestId',v_s.id);
end $$;
revoke all on function public.platform_verify_district_signer(uuid,text) from public,anon;
grant execute on function public.platform_verify_district_signer(uuid,text) to authenticated;

-- Token issuing/consumption belongs to the server-only function. Neither the
-- raw link token nor a reusable signing permission is stored in the database.
create function public.server_issue_district_signer_token(p_signer_id uuid,p_token_sha256 text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp
as $$
declare v_s record; v_p record;
begin
  if auth.role() <> 'service_role' or p_token_sha256 !~ '^[0-9a-f]{64}$'
  then raise exception 'Service operation denied' using errcode='42501'; end if;
  select * into v_s from safebus_private.district_agreement_signers
   where id=p_signer_id for update;
  select * into v_p from safebus_private.district_agreement_packages
   where id=v_s.package_id and status='issued';
  if v_s.id is null or v_s.status<>'verified' or v_p.id is null
    or v_s.authority_ref is null or v_s.verified_by is null
  then raise exception 'Unverified signer may not be invited' using errcode='42501'; end if;
  update safebus_private.district_agreement_signers
   set status='invited',token_sha256=p_token_sha256,
       token_expires_at=now()+interval '48 hours'
   where id=v_s.id;
  insert into safebus_private.district_agreement_events(tenant_id,package_id,signer_id,
    event_type,bundle_sha256)
   values(v_s.tenant_id,v_s.package_id,v_s.id,'invitation_issued',v_p.bundle_sha256);
  return jsonb_build_object('state','invited','recipientEmail',v_s.signer_email);
end $$;
revoke all on function public.server_issue_district_signer_token(uuid,text)
 from public,anon,authenticated;
grant execute on function public.server_issue_district_signer_token(uuid,text) to service_role;

create function public.server_revoke_district_signer_token(p_signer_id uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp
as $$
declare v_s record;
begin
 if auth.role()<>'service_role' then raise exception 'Service operation denied' using errcode='42501'; end if;
 select * into v_s from safebus_private.district_agreement_signers where id=p_signer_id for update;
 if v_s.status='invited' then
  update safebus_private.district_agreement_signers set status='revoked',
   token_sha256=null,token_expires_at=null where id=v_s.id;
  insert into safebus_private.district_agreement_events(tenant_id,package_id,signer_id,event_type,bundle_sha256)
   select v_s.tenant_id,v_s.package_id,v_s.id,'invitation_revoked',a.bundle_sha256
   from safebus_private.district_agreement_packages a where a.id=v_s.package_id;
  return true;
 end if;
 return false;
end $$;
revoke all on function public.server_revoke_district_signer_token(uuid) from public,anon,authenticated;
grant execute on function public.server_revoke_district_signer_token(uuid) to service_role;

create function public.server_get_district_signer_package(p_token_sha256 text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,safebus_private,pg_temp
as $$
declare v_s record;v_p record;
begin
 if auth.role()<>'service_role' or p_token_sha256 !~ '^[0-9a-f]{64}$'
 then raise exception 'Service operation denied' using errcode='42501'; end if;
 select * into v_s from safebus_private.district_agreement_signers s
  where s.token_sha256=p_token_sha256 and s.status='invited'
    and s.token_used_at is null and s.token_expires_at>now();
 select * into v_p from safebus_private.district_agreement_packages a
  where a.id=v_s.package_id and a.status='issued';
 if v_s.id is null or v_p.id is null then return null; end if;
 return jsonb_build_object('state','ready','signerName',v_s.signer_name,
   'signerTitle',v_s.signer_title,'tenantId',v_s.tenant_id,
   'packageId',v_p.id,'revision',v_p.revision,
   'bundleHash',v_p.bundle_sha256,'documents',v_p.documents,
   'expiresAt',v_s.token_expires_at);
end $$;
revoke all on function public.server_get_district_signer_package(text) from public,anon,authenticated;
grant execute on function public.server_get_district_signer_package(text) to service_role;

create function public.server_sign_district_agreement(
  p_token_sha256 text,p_bundle_sha256 text,p_signer_name text,p_signer_title text,
  p_electronic_consent boolean,p_binding_authority boolean)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp
as $$
declare v_s record;v_p record;
begin
 if auth.role()<>'service_role' or p_token_sha256 !~ '^[0-9a-f]{64}$'
 then raise exception 'Service operation denied' using errcode='42501'; end if;
 select * into v_s from safebus_private.district_agreement_signers
  where token_sha256=p_token_sha256 for update;
 select * into v_p from safebus_private.district_agreement_packages
  where id=v_s.package_id for update;
 if v_s.id is null or v_p.id is null or v_s.status<>'invited' or v_p.status<>'issued'
   or v_s.token_used_at is not null or v_s.token_expires_at<=now()
   or v_p.bundle_sha256 is distinct from p_bundle_sha256
   or lower(trim(v_s.signer_name))<>lower(trim(coalesce(p_signer_name,'')))
   or lower(trim(v_s.signer_title))<>lower(trim(coalesce(p_signer_title,'')))
   or v_s.authority_ref is null or v_s.verified_by is null
   or p_electronic_consent is distinct from true
   or p_binding_authority is distinct from true
 then raise exception 'Signing is unavailable: recheck link and approved documents'
   using errcode='42501'; end if;
 update safebus_private.district_agreement_signers
   set status='signed',token_used_at=now(),token_sha256=null
   where id=v_s.id;
 update safebus_private.district_agreement_packages
   set status='customer_signed',customer_signed_at=now(),
     customer_signer_name=v_s.signer_name,customer_signer_title=v_s.signer_title
   where id=v_p.id;
 insert into safebus_private.district_agreement_events(tenant_id,package_id,signer_id,
    event_type,bundle_sha256,detail)
  values(v_s.tenant_id,v_p.id,v_s.id,'customer_signed',v_p.bundle_sha256,
    jsonb_build_object('authorityRef',v_s.authority_ref,'emailVerifiedBy','single_use_signed_link'));
 return jsonb_build_object('state','customer_signed','packageId',v_p.id,
   'bundleHash',v_p.bundle_sha256,'recordedAt',now());
end $$;
revoke all on function public.server_sign_district_agreement(text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.server_sign_district_agreement(text,text,text,text,boolean,boolean) to service_role;

create function public.platform_countersign_district_agreement(
 p_tenant_id uuid,p_bundle_sha256 text,p_provider_name text,p_provider_title text,
 p_provider_authority_ref text,p_electronic_consent boolean)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid;v_p record;
begin
 v_actor:=safebus_private.district_contract_actor('platform_super_admin');
 if length(trim(coalesce(p_provider_name,''))) not between 2 and 160
  or length(trim(coalesce(p_provider_title,''))) not between 2 and 120
  or p_provider_authority_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'
  or p_electronic_consent is distinct from true
 then raise exception 'Verified provider-signing authority required' using errcode='22023'; end if;
 select * into v_p from safebus_private.district_agreement_packages
  where tenant_id=p_tenant_id and status='customer_signed' for update;
 if v_p.id is null or v_p.bundle_sha256 is distinct from p_bundle_sha256
 then raise exception 'Customer has not signed this exact contract revision' using errcode='55006'; end if;
 update safebus_private.district_agreement_packages set status='executed',
  provider_signed_at=now(),provider_signer_name=trim(p_provider_name),
  provider_signer_title=trim(p_provider_title),provider_authority_ref=p_provider_authority_ref
 where id=v_p.id;
 insert into safebus_private.district_agreement_events(tenant_id,package_id,event_type,
  actor_profile_id,bundle_sha256,detail)
  values(v_p.tenant_id,v_p.id,'provider_signed',v_p.bundle_sha256,
     jsonb_build_object('providerAuthorityRef',p_provider_authority_ref));
 return jsonb_build_object('state','executed','packageId',v_p.id,'bundleHash',v_p.bundle_sha256);
end $$;
revoke all on function public.platform_countersign_district_agreement(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.platform_countersign_district_agreement(uuid,text,text,text,text,boolean) to authenticated;

create function public.platform_activate_district_agreement(
 p_tenant_id uuid,p_bundle_sha256 text,p_approval_refs jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,auth,pg_temp
as $$
declare v_actor uuid;v_p record;v_key text;
begin
 v_actor:=safebus_private.district_contract_actor('platform_super_admin');
 if jsonb_typeof(p_approval_refs)<>'object'
 then raise exception 'Required launch approvals absent' using errcode='22023'; end if;
 foreach v_key in array array['privacy','operations','pilot','supplier','security']
 loop
   if coalesce(p_approval_refs->>v_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$'
   then raise exception 'Required launch approval reference missing: %',v_key using errcode='22023';
   end if;
 end loop;
 select * into v_p from safebus_private.district_agreement_packages
 where tenant_id=p_tenant_id and status='executed' for update;
 if v_p.id is null or v_p.bundle_sha256 is distinct from p_bundle_sha256
 then raise exception 'Executed agreement required for activation' using errcode='55006'; end if;
 if exists(select 1 from safebus_private.district_agreement_packages a
    where a.tenant_id=p_tenant_id and a.status='active')
 then raise exception 'An active contract must be amended through a reviewed process' using errcode='55006'; end if;
 update safebus_private.district_agreement_packages
   set status='active',activated_at=now(),activation_refs=p_approval_refs where id=v_p.id;
 insert into safebus_private.district_agreement_events(tenant_id,package_id,event_type,
  actor_profile_id,bundle_sha256,detail)
 values(v_p.tenant_id,v_p.id,'package_activated',v_actor,v_p.bundle_sha256,
   jsonb_build_object('evidenceReferences',p_approval_refs));
 return jsonb_build_object('state','active','packageId',v_p.id);
end $$;
revoke all on function public.platform_activate_district_agreement(uuid,text,jsonb) from public,anon;
grant execute on function public.platform_activate_district_agreement(uuid,text,jsonb) to authenticated;

-- The contract stored rows must not be writable through the public schema.
-- Owner approval, signer evidence and any future production release remain
-- separate human decisions. Do not run this prepared migration without explicit
-- protected release approval and security/advisory verification.
