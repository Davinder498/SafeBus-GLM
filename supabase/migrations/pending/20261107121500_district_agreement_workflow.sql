-- SafeBus school-authority agreement workflow (staged, non-disruptive).
-- Customer legal drafts are NOT seeded, published, accepted, or treated as executed.
-- Nothing here changes current tenant entitlement or activates contractual billing gates.
-- Live deployment requires a reviewed migration and the protected release procedure.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists safebus_private.agreement_document_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'msa','dpa','order_form','security','sla','acceptable_use','data_return','suppliers'
  )),
  title text not null check (length(btrim(title)) between 3 and 160),
  version text not null check (length(btrim(version)) between 1 and 80),
  body_markdown text not null check (length(btrim(body_markdown)) >= 100),
  sha256 text generated always as (
    encode(sha256(convert_to(body_markdown, 'UTF8')), 'hex')
  ) stored,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  unique(kind, version),
  check ((approved_at is null) = (approved_by is null))
);
alter table safebus_private.agreement_document_versions enable row level security;
revoke all on safebus_private.agreement_document_versions from public, anon, authenticated;

create table if not exists safebus_private.agreement_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  version text not null check (length(btrim(version)) between 1 and 80),
  document_ids uuid[] not null,
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'issued' check (status in (
    'issued','under_review','pending_authority','pending_customer_signature',
    'pending_provider_signature','execution_pending','executed',
    'activation_pending','active','withdrawn','declined','expired','superseded'
  )),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  issued_by uuid not null references auth.users(id),
  signer_profile_id uuid references public.profiles(id),
  authority_evidence_reference text,
  authority_verified_by uuid references auth.users(id),
  authority_verified_at timestamptz,
  customer_signed_at timestamptz,
  customer_signer_name text,
  customer_signer_title text,
  provider_signed_at timestamptz,
  provider_signer_profile_id uuid references public.profiles(id),
  provider_signer_name text,
  provider_signer_title text,
  updated_at timestamptz not null default now(),
  unique (tenant_id, version),
  check ((authority_verified_at is null) = (authority_verified_by is null)),
  check ((customer_signed_at is null) = (customer_signer_name is null)),
  check ((provider_signed_at is null) = (provider_signer_profile_id is null))
);
create unique index if not exists one_open_district_agreement
  on safebus_private.agreement_packages (tenant_id)
  where status not in ('withdrawn','declined','expired','superseded');
create index if not exists agreement_packages_tenant_issued
  on safebus_private.agreement_packages(tenant_id, issued_at desc);
alter table safebus_private.agreement_packages enable row level security;
revoke all on safebus_private.agreement_packages from public, anon, authenticated;

create table if not exists safebus_private.agreement_signature_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references safebus_private.agreement_packages(id),
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in (
    'issued','review_acknowledged','officer_referral','external_process_requested',
    'authority_verified','customer_signed','provider_countersigned','declined','withdrawn'
  )),
  bundle_sha256 text not null check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default statement_timestamp()
);
create index if not exists agreement_events_package_time
  on safebus_private.agreement_signature_events(package_id, happened_at);
alter table safebus_private.agreement_signature_events enable row level security;
revoke all on safebus_private.agreement_signature_events from public, anon, authenticated;

create table if not exists safebus_private.agreement_officer_requests (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references safebus_private.agreement_packages(id),
  tenant_id uuid not null references public.tenants(id),
  requested_by uuid not null references auth.users(id),
  officer_name text,
  officer_email text,
  process_type text not null check (process_type in ('officer','district_external')),
  status text not null default 'awaiting_review' check (
    status in ('awaiting_review','verified','cancelled','completed')
  ),
  created_at timestamptz not null default now(),
  check (
    (process_type='district_external' and officer_name is null and officer_email is null)
    or (process_type='officer' and officer_name is not null and officer_email is not null)
  )
);
alter table safebus_private.agreement_officer_requests enable row level security;
revoke all on safebus_private.agreement_officer_requests from public, anon, authenticated;

create table if not exists safebus_private.tenant_agreement_activation_checks (
  package_id uuid primary key references safebus_private.agreement_packages(id),
  tenant_id uuid not null references public.tenants(id),
  pii_authority_verified boolean not null default false,
  privacy_pia_reviewed boolean not null default false,
  supplier_reviewed boolean not null default false,
  finance_approved boolean not null default false,
  pilot_operations_approved boolean not null default false,
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id),
  evidence_reference text
);
alter table safebus_private.tenant_agreement_activation_checks enable row level security;
revoke all on safebus_private.tenant_agreement_activation_checks from public, anon, authenticated;

-- An approved document is forever immutable. Private rows cannot be accessed
-- directly by browser roles; only the role-checked RPC returns a bound package.
create or replace function safebus_private.guard_agreement_document()
returns trigger language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' or old.approved_at is not null then
    raise exception 'Agreement document versions are immutable once approved.' using errcode='42501';
  end if;
  if new.kind is distinct from old.kind
    or new.version is distinct from old.version
    or new.body_markdown is distinct from old.body_markdown
    or new.title is distinct from old.title then
    raise exception 'Create a new document version rather than changing a draft in place.'
      using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_agreement_document_before_change
before update or delete on safebus_private.agreement_document_versions
for each row execute function safebus_private.guard_agreement_document();

create or replace function safebus_private.reject_agreement_event_change()
returns trigger language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'Agreement audit events cannot be edited or deleted.' using errcode='42501';
end;
$$;
create trigger immutable_agreement_audit
before update or delete on safebus_private.agreement_signature_events
for each row execute function safebus_private.reject_agreement_event_change();

create or replace function safebus_private.agreement_actor(p_role text)
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null or not public.is_current_user_session_active()
     or not exists (
       select 1 from public.profiles p
       where p.id=v_user and p.status='active' and p.role::text=p_role
         and (p_role='platform_super_admin' or exists (
           select 1 from public.tenants t where t.id=p.tenant_id and t.status='active'))
     ) then
    raise exception 'Authorized active SafeBus session required.' using errcode='42501';
  end if;
  return v_user;
end;
$$;
revoke all on function safebus_private.agreement_actor(text) from public, anon, authenticated;

create or replace function safebus_private.require_agreement_mfa()
returns void language plpgsql stable security invoker
set search_path = pg_catalog, auth, pg_temp as $$
begin
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Verify multi-factor authentication before signing.' using errcode='42501';
  end if;
end;
$$;
revoke all on function safebus_private.require_agreement_mfa() from public, anon, authenticated;

-- Platform publishes ONLY an exact final eight-document set. Text is entered
-- outside source control through restricted operator procedures after legal approval.
create or replace function public.platform_issue_district_agreement(
  p_tenant_id uuid, p_version text, p_document_ids uuid[], p_valid_days integer default 30
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare
  v_actor uuid;
  v_count int;
  v_distinct int;
  v_kinds text[];
  v_digest text;
  v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('platform_super_admin');
  perform safebus_private.require_agreement_mfa();
  if p_tenant_id is null or nullif(btrim(p_version),'') is null
     or p_valid_days not between 1 and 90
     or coalesce(array_length(p_document_ids,1),0) <> 8 then
    raise exception 'A tenant, version and all eight final documents are required.';
  end if;
  if not exists (select 1 from public.tenants where id=p_tenant_id and status='active') then
    raise exception 'School authority not available.';
  end if;
  select count(*), count(distinct d.kind), array_agg(distinct d.kind order by d.kind)
    into v_count,v_distinct,v_kinds
  from safebus_private.agreement_document_versions d
  where d.id=any(p_document_ids) and d.approved_at is not null;
  if v_count<>8 or v_distinct<>8 or v_kinds <> array[
     'acceptable_use','data_return','dpa','msa','order_form',
     'security','sla','suppliers'
  ]::text[] then
    raise exception 'All eight different approved document kinds are mandatory.';
  end if;
  if exists (select 1 from safebus_private.agreement_packages p
             where p.tenant_id=p_tenant_id
               and p.status not in ('withdrawn','declined','expired','superseded')) then
    raise exception 'Resolve the current agreement before issuing another version.';
  end if;
  select encode(sha256(convert_to(
    p_tenant_id::text || ':' || p_version || ':' ||
    string_agg(d.kind || ':' || d.version || ':' || d.sha256, E'\n' order by d.kind),
    'UTF8')), 'hex') into v_digest
  from safebus_private.agreement_document_versions d where d.id=any(p_document_ids);
  insert into safebus_private.agreement_packages(
    tenant_id,version,document_ids,bundle_sha256,expires_at,issued_by
  ) values(p_tenant_id,p_version,p_document_ids,v_digest,
           statement_timestamp()+make_interval(days => p_valid_days),v_actor)
  returning * into v_package;
  insert into safebus_private.agreement_signature_events(
     package_id,tenant_id,actor_id,event_type,bundle_sha256
  ) values(v_package.id,p_tenant_id,v_actor,'issued',v_digest);
  return jsonb_build_object('id',v_package.id,'status',v_package.status,
      'bundle_sha256',v_digest);
end;
$$;
revoke all on function public.platform_issue_district_agreement(uuid,text,uuid[],integer)
from public,anon;
grant execute on function public.platform_issue_district_agreement(uuid,text,uuid[],integer)
to authenticated;

-- Platform approval remains a separate deliberate operation. Prevents an invited
-- tenant administrator from "verifying" their own legal signing authority.
create or replace function public.platform_verify_district_signer(
  p_package_id uuid,p_signer_profile_id uuid,p_evidence_reference text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid; v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('platform_super_admin');
  perform safebus_private.require_agreement_mfa();
  if length(btrim(coalesce(p_evidence_reference,''))) not between 8 and 500 then
    raise exception 'A validated signing-delegation evidence reference is required.';
  end if;
  select * into v_package from safebus_private.agreement_packages
  where id=p_package_id for update;
  if not found or v_package.status not in ('issued','under_review','pending_authority')
      or v_package.expires_at <= statement_timestamp() then
    raise exception 'The agreement is not available for authority verification.';
  end if;
  if not exists (select 1 from public.profiles p
      where p.id=p_signer_profile_id and p.tenant_id=v_package.tenant_id
        and p.role='tenant_admin' and p.status='active') then
    raise exception 'The signer must be an active administrator for this district.';
  end if;
  update safebus_private.agreement_packages
   set signer_profile_id=p_signer_profile_id,
       authority_evidence_reference=btrim(p_evidence_reference),
       authority_verified_by=v_actor,authority_verified_at=statement_timestamp(),
       status='pending_customer_signature',updated_at=statement_timestamp()
   where id=p_package_id;
  insert into safebus_private.agreement_signature_events(
    package_id,tenant_id,actor_id,event_type,bundle_sha256,evidence
  ) values(p_package_id,v_package.tenant_id,v_actor,'authority_verified',
           v_package.bundle_sha256,jsonb_build_object('signer_profile_id',p_signer_profile_id,
                'evidence_reference',btrim(p_evidence_reference)));
  return jsonb_build_object('status','pending_customer_signature');
end;
$$;
revoke all on function public.platform_verify_district_signer(uuid,uuid,text) from public,anon;
grant execute on function public.platform_verify_district_signer(uuid,uuid,text) to authenticated;

-- All document content is returned only to an active tenant administrator of
-- its exact tenant. No package enumeration, student data, or public storage.
create or replace function public.get_my_district_agreement()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid; v_tenant uuid; v_package safebus_private.agreement_packages%rowtype;
declare v_docs jsonb;
begin
  v_actor := safebus_private.agreement_actor('tenant_admin');
  select p.tenant_id into v_tenant from public.profiles p where p.id=v_actor;
  select * into v_package from safebus_private.agreement_packages
  where tenant_id=v_tenant order by issued_at desc,id desc limit 1;
  if not found then
    return jsonb_build_object('status','not_issued',
      'tenant_name',(select name from public.tenants where id=v_tenant),
      'documents','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
     'id',d.id,'kind',d.kind,'title',d.title,'version',d.version,
     'sha256',d.sha256,'body',d.body_markdown
   ) order by u.ordinality),'[]'::jsonb) into v_docs
  from unnest(v_package.document_ids) with ordinality as u(doc_id,ordinality)
  join safebus_private.agreement_document_versions d on d.id=u.doc_id;
  return jsonb_build_object(
    'id',v_package.id,'status',v_package.status,'version',v_package.version,
    'bundle_sha256',v_package.bundle_sha256,'issued_at',v_package.issued_at,
    'expires_at',v_package.expires_at,
    'tenant_name',(select name from public.tenants where id=v_tenant),
    'signer_profile_id',v_package.signer_profile_id,
    'authority_verified',v_package.authority_verified_at is not null,
    'customer_signed_at',v_package.customer_signed_at,
    'provider_signed_at',v_package.provider_signed_at,
    'documents',v_docs);
end;
$$;
revoke all on function public.get_my_district_agreement() from public,anon;
grant execute on function public.get_my_district_agreement() to authenticated;

-- Read-only platform metadata; never exposes customer document content to
-- wider platform dashboards, and never gives a platform actor signing rights.
create or replace function public.get_platform_district_agreement(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid; v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('platform_super_admin');
  select * into v_package from safebus_private.agreement_packages
    where tenant_id=p_tenant_id order by issued_at desc,id desc limit 1;
  if not found then return jsonb_build_object('status','not_issued'); end if;
  return jsonb_build_object(
    'id',v_package.id,'status',v_package.status,'version',v_package.version,
    'issued_at',v_package.issued_at,'expires_at',v_package.expires_at,
    'authority_verified',v_package.authority_verified_at is not null,
    'signer_profile_id',v_package.signer_profile_id,
    'customer_signed_at',v_package.customer_signed_at,
    'provider_signed_at',v_package.provider_signed_at,
    'pending_officer_requests',(
      select count(*) from safebus_private.agreement_officer_requests r
      where r.package_id=v_package.id and r.status='awaiting_review'));
end;
$$;
revoke all on function public.get_platform_district_agreement(uuid) from public,anon;
grant execute on function public.get_platform_district_agreement(uuid) to authenticated;

create or replace function public.acknowledge_district_agreement_review(
  p_package_id uuid,p_bundle_sha256 text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid; v_tenant uuid; v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('tenant_admin');
  select tenant_id into v_tenant from public.profiles where id=v_actor;
  select * into v_package from safebus_private.agreement_packages
    where id=p_package_id and tenant_id=v_tenant for update;
  if not found or v_package.expires_at <= statement_timestamp()
    or v_package.status not in ('issued','under_review')
    or v_package.bundle_sha256 is distinct from p_bundle_sha256 then
    raise exception 'Agreement unavailable or superseded; refresh the documents.';
  end if;
  if v_package.status='issued' then
    update safebus_private.agreement_packages
      set status='under_review',updated_at=statement_timestamp() where id=p_package_id;
    insert into safebus_private.agreement_signature_events(
      package_id,tenant_id,actor_id,event_type,bundle_sha256
    ) values(v_package.id,v_tenant,v_actor,'review_acknowledged',v_package.bundle_sha256);
  end if;
  return jsonb_build_object('status','under_review');
end;
$$;
revoke all on function public.acknowledge_district_agreement_review(uuid,text) from public,anon;
grant execute on function public.acknowledge_district_agreement_review(uuid,text) to authenticated;

create or replace function public.request_district_agreement_signer(
  p_package_id uuid,p_bundle_sha256 text,p_officer_name text default null,
  p_officer_email text default null,p_external_process boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid;v_tenant uuid;v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('tenant_admin');
  select tenant_id into v_tenant from public.profiles where id=v_actor;
  select * into v_package from safebus_private.agreement_packages
    where id=p_package_id and tenant_id=v_tenant for update;
  if not found or v_package.status not in ('issued','under_review','pending_authority')
     or v_package.expires_at <= statement_timestamp()
     or v_package.bundle_sha256 is distinct from p_bundle_sha256 then
    raise exception 'Agreement is not available for a signing request.';
  end if;
  if not p_external_process and (
       length(btrim(coalesce(p_officer_name,''))) not between 3 and 160
    or coalesce(p_officer_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or length(coalesce(p_officer_email,''))>255) then
    raise exception 'Enter the authorized officer name and business email.';
  end if;
  if exists (select 1 from safebus_private.agreement_officer_requests
             where package_id=p_package_id and status='awaiting_review') then
    raise exception 'A signing request is already awaiting SafeBus verification.';
  end if;
  insert into safebus_private.agreement_officer_requests(
    package_id,tenant_id,requested_by,officer_name,officer_email,process_type
  ) values(p_package_id,v_tenant,v_actor,
     case when p_external_process then null else btrim(p_officer_name) end,
     case when p_external_process then null else lower(btrim(p_officer_email)) end,
     case when p_external_process then 'district_external' else 'officer' end);
  update safebus_private.agreement_packages
     set status='pending_authority',updated_at=statement_timestamp()
     where id=p_package_id;
  insert into safebus_private.agreement_signature_events(
    package_id,tenant_id,actor_id,event_type,bundle_sha256
  ) values(p_package_id,v_tenant,v_actor,
    case when p_external_process then 'external_process_requested' else 'officer_referral' end,
    v_package.bundle_sha256);
  return jsonb_build_object('status','pending_authority',
    'request','awaiting_verification','invitation_sent',false);
end;
$$;
revoke all on function public.request_district_agreement_signer(uuid,text,text,text,boolean)
from public,anon;
grant execute on function public.request_district_agreement_signer(uuid,text,text,text,boolean)
to authenticated;

-- A signature cannot be inferred from a checkbox, page view, payment, or invite.
-- The provider must separately countersign and a trusted worker must later
-- attach the immutable executed PDF/receipt before status can become executed.
create or replace function public.customer_sign_district_agreement(
  p_package_id uuid,p_bundle_sha256 text,p_signer_name text,p_signer_title text,
  p_electronic_consent boolean,p_signature_intent boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid;v_tenant uuid;v_package safebus_private.agreement_packages%rowtype;
declare v_actual_digest text;
begin
  v_actor := safebus_private.agreement_actor('tenant_admin');
  perform safebus_private.require_agreement_mfa();
  select tenant_id into v_tenant from public.profiles where id=v_actor;
  if not coalesce(p_electronic_consent,false) or not coalesce(p_signature_intent,false)
     or length(btrim(coalesce(p_signer_name,''))) not between 3 and 160
     or length(btrim(coalesce(p_signer_title,''))) not between 2 and 120 then
    raise exception 'Explicit consent, full name, and title are mandatory.';
  end if;
  select * into v_package from safebus_private.agreement_packages
   where id=p_package_id and tenant_id=v_tenant for update;
  if not found or v_package.status<>'pending_customer_signature'
    or v_package.expires_at<=statement_timestamp()
    or v_package.signer_profile_id is distinct from v_actor
    or v_package.authority_verified_at is null
    or v_package.bundle_sha256 is distinct from p_bundle_sha256 then
    raise exception 'Signing authority or current agreement cannot be verified.';
  end if;
  if (select count(*) from unnest(v_package.document_ids))<>8 or
     (select count(*) from safebus_private.agreement_document_versions d
         where d.id=any(v_package.document_ids) and d.approved_at is not null)<>8 then
    raise exception 'Approved immutable documents are incomplete.';
  end if;
  select encode(sha256(convert_to(
    v_package.tenant_id::text || ':' || v_package.version || ':' ||
    string_agg(d.kind || ':' || d.version || ':' || d.sha256, E'\n' order by d.kind),
    'UTF8')), 'hex') into v_actual_digest
  from safebus_private.agreement_document_versions d where d.id=any(v_package.document_ids);
  if v_actual_digest is distinct from v_package.bundle_sha256 then
    raise exception 'The approved agreement changed; a fresh package is required.';
  end if;
  update safebus_private.agreement_packages set
    customer_signed_at=statement_timestamp(),
    customer_signer_name=btrim(p_signer_name),customer_signer_title=btrim(p_signer_title),
    status='pending_provider_signature',updated_at=statement_timestamp()
  where id=p_package_id;
  insert into safebus_private.agreement_signature_events(
    package_id,tenant_id,actor_id,event_type,bundle_sha256,evidence
  ) values(p_package_id,v_tenant,v_actor,'customer_signed',v_package.bundle_sha256,
      jsonb_build_object('name',btrim(p_signer_name),'title',btrim(p_signer_title),
        'electronic_transactions_consent',true,'signature_intent',true,
        'aal','aal2','authority_evidence_reference',v_package.authority_evidence_reference));
  return jsonb_build_object('status','pending_provider_signature',
     'executed',false,'customer_signed',true);
end;
$$;
revoke all on function public.customer_sign_district_agreement(uuid,text,text,text,boolean,boolean)
from public,anon;
grant execute on function public.customer_sign_district_agreement(uuid,text,text,text,boolean,boolean)
to authenticated;

create or replace function public.platform_countersign_district_agreement(
  p_package_id uuid,p_signer_name text,p_signer_title text,p_signature_intent boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare v_actor uuid;v_package safebus_private.agreement_packages%rowtype;
begin
  v_actor := safebus_private.agreement_actor('platform_super_admin');
  perform safebus_private.require_agreement_mfa();
  if not coalesce(p_signature_intent,false)
    or length(btrim(coalesce(p_signer_name,''))) not between 3 and 160
    or length(btrim(coalesce(p_signer_title,''))) not between 2 and 120 then
    raise exception 'Explicit provider signing intent, name and title are required.';
  end if;
  select * into v_package from safebus_private.agreement_packages
    where id=p_package_id for update;
  if not found or v_package.status<>'pending_provider_signature'
    or v_package.customer_signed_at is null then
    raise exception 'Customer signature must be verified before countersigning.';
  end if;
  update safebus_private.agreement_packages set
    provider_signed_at=statement_timestamp(),provider_signer_profile_id=v_actor,
    provider_signer_name=btrim(p_signer_name),provider_signer_title=btrim(p_signer_title),
    status='execution_pending',updated_at=statement_timestamp()
  where id=p_package_id;
  insert into safebus_private.agreement_signature_events(
    package_id,tenant_id,actor_id,event_type,bundle_sha256,evidence
  ) values(p_package_id,v_package.tenant_id,v_actor,'provider_countersigned',
     v_package.bundle_sha256,
     jsonb_build_object('name',btrim(p_signer_name),'title',btrim(p_signer_title),'aal','aal2'));
  return jsonb_build_object('status','execution_pending','executed',false,
    'notice','Immutable executed document and receipt verification still required.');
end;
$$;
revoke all on function public.platform_countersign_district_agreement(uuid,text,text,text,boolean)
from public,anon;
grant execute on function public.platform_countersign_district_agreement(uuid,text,text,text,boolean)
to authenticated;

-- Deliberately no RPC to mark an agreement executed, unlock billing, or
-- enable real student/GPS processing. The approved artifact writer, its signed
-- receipt and independently reviewed activation approvals must be implemented
-- before making that transition possible.
comment on table safebus_private.agreement_packages is
  'Staged district MSA/DPA packages. Never infer executed or service active from signature alone.';
