-- SafeBus district clickwrap: final published terms -> tenant admin consent -> executed receipt.
-- Forward-only, pending protected release. Do NOT seed or publish draft contract wording.
-- Existing active tenants are grandfathered. New tenant writes are gated at SQL triggers.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table safebus_private.agreement_document_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('msa','dpa','order_form','security','sla',
    'acceptable_use','data_return','suppliers')),
  title text not null check(length(btrim(title)) between 3 and 160),
  version text not null check(length(btrim(version)) between 1 and 80),
  body_markdown text not null check(length(btrim(body_markdown)) between 100 and 150000),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default statement_timestamp(),
  approved_by uuid not null references auth.users(id),
  unique(kind,version)
);
alter table safebus_private.agreement_document_versions enable row level security;
revoke all on safebus_private.agreement_document_versions from public,anon,authenticated;

create table safebus_private.agreement_catalog (
  id boolean primary key default true check(id),
  revision integer not null check(revision > 0),
  document_ids uuid[] not null,
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default statement_timestamp(),
  published_by uuid not null references auth.users(id)
);
alter table safebus_private.agreement_catalog enable row level security;
revoke all on safebus_private.agreement_catalog from public,anon,authenticated;

create table safebus_private.agreement_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  revision integer not null check(revision>0),
  document_ids uuid[] not null,
  bundle_sha256 text not null check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'issued' check(status in ('issued','executed','superseded')),
  issued_at timestamptz not null default statement_timestamp(),
  issued_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  accepted_name text,
  accepted_title text,
  unique(tenant_id,revision),
  check((accepted_at is null) = (accepted_by is null))
);
create index agreement_packages_tenant_issued
  on safebus_private.agreement_packages(tenant_id,issued_at desc);
alter table safebus_private.agreement_packages enable row level security;
revoke all on safebus_private.agreement_packages from public,anon,authenticated;

create table safebus_private.agreement_executed_artifacts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique references safebus_private.agreement_packages(id),
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references auth.users(id),
  actor_email text not null,
  actor_name text not null,
  actor_title text not null,
  actor_session_id text not null,
  signed_at timestamptz not null default statement_timestamp(),
  bundle_sha256 text not null check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  document_snapshot jsonb not null,
  receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
  consent_electronic_records boolean not null check(consent_electronic_records),
  authority_attestation boolean not null check(authority_attestation),
  accept_complete_package boolean not null check(accept_complete_package),
  provider_name text not null default 'Sachman Gold Inc. (SafeBus)',
  unique(id,tenant_id)
);
create index agreement_receipts_tenant_time
  on safebus_private.agreement_executed_artifacts(tenant_id,signed_at desc);
alter table safebus_private.agreement_executed_artifacts enable row level security;
revoke all on safebus_private.agreement_executed_artifacts from public,anon,authenticated;

-- Only tenants created after this migration require agreements before operations.
-- Existing tenants are unaffected and may accept new terms voluntarily.
create table safebus_private.tenant_agreement_requirement (
  tenant_id uuid primary key references public.tenants(id),
  required_since timestamptz not null default statement_timestamp()
);
alter table safebus_private.tenant_agreement_requirement enable row level security;
revoke all on safebus_private.tenant_agreement_requirement from public,anon,authenticated;

create function safebus_private.agreement_new_tenant()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp as $$
begin
  insert into safebus_private.tenant_agreement_requirement(tenant_id) values(new.id);
  return new;
end;
$$;
create trigger require_agreement_for_new_tenant
after insert on public.tenants
for each row execute function safebus_private.agreement_new_tenant();

create function safebus_private.agreement_actor(p_role text)
returns public.profiles language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_profile public.profiles;
begin
  if auth.uid() is null or not public.is_current_user_session_active()
     or auth.jwt()->>'aal' <> 'aal2' then
    raise exception 'Active administrator session with MFA required.' using errcode='42501';
  end if;
  select * into v_profile from public.profiles p
  where p.id=auth.uid() and p.status='active' and p.role::text=p_role;
  if not found then
    raise exception 'This role cannot manage district agreements.' using errcode='42501';
  end if;
  if p_role='tenant_admin' and not exists(
    select 1 from public.tenants t where t.id=v_profile.tenant_id and t.status='active') then
    raise exception 'The school authority is not active.' using errcode='42501';
  end if;
  return v_profile;
end;
$$;
revoke all on function safebus_private.agreement_actor(text) from public,anon,authenticated;

create function safebus_private.agreement_immutable()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,pg_temp as $$
begin
  raise exception 'Published documents and executed receipts are immutable.' using errcode='42501';
end;
$$;
create trigger published_docs_immutable
before update or delete on safebus_private.agreement_document_versions
for each row execute function safebus_private.agreement_immutable();
create trigger executed_receipts_immutable
before update or delete on safebus_private.agreement_executed_artifacts
for each row execute function safebus_private.agreement_immutable();

create function public.platform_publish_agreement_document(
  p_kind text,p_title text,p_version text,p_body text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles; v_doc safebus_private.agreement_document_versions;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  if length(btrim(coalesce(p_body,''))) not between 100 and 150000
    or length(btrim(coalesce(p_title,''))) not between 3 and 160
    or length(btrim(coalesce(p_version,''))) not between 1 and 80
    or p_kind not in('msa','dpa','order_form','security','sla','acceptable_use','data_return','suppliers')
    or p_body ~ '\[[A-Z_]{3,}\]'
    or p_body ~* '(^|[[:space:]])(DRAFT|NOT EXECUTED|FOR REVIEW ONLY)([[:space:]]|$)' then
    raise exception 'Only final, complete, reviewed contract wording may be published.';
  end if;
  insert into safebus_private.agreement_document_versions(
    kind,title,version,body_markdown,sha256,approved_by
  ) values (p_kind,btrim(p_title),btrim(p_version),p_body,
    encode(sha256(convert_to(p_body,'UTF8')),'hex'),v_actor.id)
  returning * into v_doc;
  return jsonb_build_object('id',v_doc.id,'kind',v_doc.kind,'version',v_doc.version,
    'sha256',v_doc.sha256);
end;
$$;
revoke all on function public.platform_publish_agreement_document(text,text,text,text) from public,anon;
grant execute on function public.platform_publish_agreement_document(text,text,text,text) to authenticated;

create function public.platform_list_agreement_documents()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'kind',d.kind,'title',d.title,'version',d.version,
    'sha256',d.sha256,'approved_at',d.approved_at
  ) order by d.kind,d.approved_at desc),'[]'::jsonb)
  from safebus_private.agreement_document_versions d);
end;
$$;
revoke all on function public.platform_list_agreement_documents() from public,anon;
grant execute on function public.platform_list_agreement_documents() to authenticated;

create function public.platform_publish_agreement_catalog(p_document_ids uuid[])
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;v_count integer;v_kinds text[];v_digest text;v_revision integer;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  if coalesce(array_length(p_document_ids,1),0)<>8 then
    raise exception 'Select all eight contract documents.';
  end if;
  select count(*),array_agg(distinct d.kind order by d.kind),
    encode(sha256(convert_to(string_agg(
      d.kind || ':' || d.version || ':' || d.sha256,E'\n' order by d.kind),'UTF8')),'hex')
    into v_count,v_kinds,v_digest
  from safebus_private.agreement_document_versions d where d.id=any(p_document_ids);
  if v_count<>8 or v_kinds <> array['acceptable_use','data_return','dpa','msa',
    'order_form','security','sla','suppliers']::text[] then
    raise exception 'One approved version of each required document is mandatory.';
  end if;
  insert into safebus_private.agreement_catalog(
    id,revision,document_ids,content_sha256,published_by
  ) values(true,1,p_document_ids,v_digest,v_actor.id)
  on conflict(id) do update set revision=agreement_catalog.revision+1,
    document_ids=excluded.document_ids,content_sha256=excluded.content_sha256,
    published_at=statement_timestamp(),published_by=excluded.published_by
  returning revision into v_revision;
  return jsonb_build_object('revision',v_revision,'sha256',v_digest,'published',true);
end;
$$;
revoke all on function public.platform_publish_agreement_catalog(uuid[]) from public,anon;
grant execute on function public.platform_publish_agreement_catalog(uuid[]) to authenticated;

create function public.platform_get_agreement_catalog()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  return coalesce((select jsonb_build_object(
    'revision',c.revision,'document_ids',c.document_ids,
    'content_sha256',c.content_sha256,'published_at',c.published_at
  ) from safebus_private.agreement_catalog c where c.id=true),
  jsonb_build_object('status','not_published'));
end;
$$;
revoke all on function public.platform_get_agreement_catalog() from public,anon;
grant execute on function public.platform_get_agreement_catalog() to authenticated;

create function safebus_private.ensure_district_agreement(p_tenant_id uuid,p_actor uuid)
returns safebus_private.agreement_packages language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_catalog safebus_private.agreement_catalog;v_package safebus_private.agreement_packages;
declare v_hash text;
begin
  -- Serialize generation/signature per tenant; no duplicate package on concurrent sign-ins.
  perform 1 from public.tenants where id=p_tenant_id for update;
  select * into v_catalog from safebus_private.agreement_catalog where id=true;
  if not found then return null; end if;
  select * into v_package from safebus_private.agreement_packages
    where tenant_id=p_tenant_id and revision=v_catalog.revision;
  if found then return v_package; end if;
  select encode(sha256(convert_to(p_tenant_id::text || ':' || v_catalog.revision::text ||
    ':' || v_catalog.content_sha256,'UTF8')),'hex') into v_hash;
  insert into safebus_private.agreement_packages(
    tenant_id,revision,document_ids,bundle_sha256,issued_by
  ) values(p_tenant_id,v_catalog.revision,v_catalog.document_ids,v_hash,
    v_catalog.published_by) returning * into v_package;
  return v_package;
end;
$$;
revoke all on function safebus_private.ensure_district_agreement(uuid,uuid)
from public,anon,authenticated;

create function public.get_my_district_agreement()
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;v_package safebus_private.agreement_packages;
declare v_docs jsonb;
begin
  v_actor:=safebus_private.agreement_actor('tenant_admin');
  v_package:=safebus_private.ensure_district_agreement(v_actor.tenant_id,v_actor.id);
  if v_package.id is null then
    return jsonb_build_object('status','not_issued','documents','[]'::jsonb,
      'tenant_name',(select name from public.tenants where id=v_actor.tenant_id));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'kind',d.kind,'title',d.title,'version',d.version,
    'sha256',d.sha256,'body',d.body_markdown
  ) order by d.kind),'[]'::jsonb) into v_docs
  from safebus_private.agreement_document_versions d
  where d.id=any(v_package.document_ids);
  return jsonb_build_object('id',v_package.id,'status',v_package.status,
    'version',v_package.revision::text,'revision',v_package.revision,
    'tenant_name',(select name from public.tenants where id=v_actor.tenant_id),
    'bundle_sha256',v_package.bundle_sha256,'issued_at',v_package.issued_at,
    'customer_signed_at',v_package.accepted_at,'documents',v_docs,
    'receipt_id',(select id from safebus_private.agreement_executed_artifacts
      where package_id=v_package.id));
end;
$$;
revoke all on function public.get_my_district_agreement() from public,anon;
grant execute on function public.get_my_district_agreement() to authenticated;

create function public.get_platform_district_agreement(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;v_package safebus_private.agreement_packages;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  select * into v_package from safebus_private.agreement_packages
    where tenant_id=p_tenant_id order by revision desc limit 1;
  if not found then return jsonb_build_object('status','not_issued'); end if;
  return jsonb_build_object('id',v_package.id,'status',v_package.status,
    'version',v_package.revision::text,'issued_at',v_package.issued_at,
    'customer_signed_at',v_package.accepted_at,'signer_profile_id',v_package.accepted_by);
end;
$$;
revoke all on function public.get_platform_district_agreement(uuid) from public,anon;
grant execute on function public.get_platform_district_agreement(uuid) to authenticated;

create function public.accept_my_district_agreement(
  p_package_id uuid,p_bundle_sha256 text,p_signer_name text,p_signer_title text,
  p_electronic_consent boolean,p_authority_attested boolean,p_signature_intent boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;v_package safebus_private.agreement_packages;
declare v_docs jsonb;v_snapshot jsonb;v_hash text;v_receipt safebus_private.agreement_executed_artifacts;
declare v_session text;
begin
  v_actor:=safebus_private.agreement_actor('tenant_admin');
  if not coalesce(p_electronic_consent,false) or not coalesce(p_authority_attested,false)
    or not coalesce(p_signature_intent,false)
    or length(btrim(coalesce(p_signer_name,''))) not between 3 and 160
    or length(btrim(coalesce(p_signer_title,''))) not between 2 and 120 then
    raise exception 'Explicit authority, consent, full name and title are required.';
  end if;
  v_session:=auth.jwt()->>'session_id';
  if v_session is null or v_session !~* '^[0-9a-f-]{36}$' then
    raise exception 'Active authenticated session required.' using errcode='42501';
  end if;
  select * into v_package from safebus_private.agreement_packages
    where id=p_package_id and tenant_id=v_actor.tenant_id for update;
  if not found or v_package.bundle_sha256 is distinct from p_bundle_sha256 then
    raise exception 'Agreement changed. Reload and review the exact package.';
  end if;
  if v_package.status='executed' then
    select * into v_receipt from safebus_private.agreement_executed_artifacts
      where package_id=v_package.id;
    if v_receipt.actor_id=v_actor.id then
      return jsonb_build_object('status','executed','receipt_id',v_receipt.id,
        'signed_at',v_receipt.signed_at,'replayed',true);
    end if;
    raise exception 'This package has already been accepted.';
  end if;
  if v_package.status<>'issued' then raise exception 'Agreement is unavailable.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'kind',d.kind,'title',d.title,'version',d.version,
    'sha256',d.sha256,'body',d.body_markdown
  ) order by d.kind),'[]'::jsonb) into v_docs
  from safebus_private.agreement_document_versions d where d.id=any(v_package.document_ids);
  if jsonb_array_length(v_docs)<>8 then raise exception 'Incomplete approved contract package.'; end if;
  select encode(sha256(convert_to(v_actor.tenant_id::text || ':' ||
    v_package.revision::text || ':' || c.content_sha256,'UTF8')),'hex')
  into v_hash from safebus_private.agreement_catalog c
  where c.id=true and c.revision=v_package.revision;
  -- Older revisions retain their original approved versions; reconstruct digest
  -- when the platform catalog advances, instead of accepting a changed package.
  if v_hash is null then
    select encode(sha256(convert_to(v_actor.tenant_id::text || ':' ||
      v_package.revision::text || ':' ||
      encode(sha256(convert_to(string_agg(
        d.kind || ':' || d.version || ':' || d.sha256,E'\n' order by d.kind),'UTF8')),'hex'),
      'UTF8')),'hex') into v_hash
    from safebus_private.agreement_document_versions d where d.id=any(v_package.document_ids);
  end if;
  if v_hash is distinct from v_package.bundle_sha256 then
    raise exception 'Agreement content integrity verification failed.';
  end if;
  v_snapshot:=jsonb_build_object(
    'provider','Sachman Gold Inc. (SafeBus)',
    'customer',(select t.name from public.tenants t where t.id=v_actor.tenant_id),
    'package_id',v_package.id,'revision',v_package.revision,
    'bundle_sha256',v_package.bundle_sha256,
    'documents',v_docs,'signer',jsonb_build_object(
      'user_id',v_actor.id,'email',v_actor.email,'name',btrim(p_signer_name),
      'title',btrim(p_signer_title),'session_id',v_session),
    'accepted_at',statement_timestamp(),
    'consent_electronic_records',true,'authority_attestation',true,
    'accepted_complete_package',true);
  insert into safebus_private.agreement_executed_artifacts(
    package_id,tenant_id,actor_id,actor_email,actor_name,actor_title,actor_session_id,
    bundle_sha256,document_snapshot,receipt_sha256,consent_electronic_records,
    authority_attestation,accept_complete_package
  ) values(v_package.id,v_actor.tenant_id,v_actor.id,v_actor.email,
    btrim(p_signer_name),btrim(p_signer_title),v_session,
    v_package.bundle_sha256,v_snapshot,
    encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex'),true,true,true)
  returning * into v_receipt;
  update safebus_private.agreement_packages set status='executed',
    accepted_at=v_receipt.signed_at,accepted_by=v_actor.id,
    accepted_name=btrim(p_signer_name),accepted_title=btrim(p_signer_title)
  where id=v_package.id;
  return jsonb_build_object('status','executed','receipt_id',v_receipt.id,
    'signed_at',v_receipt.signed_at,'receipt_sha256',v_receipt.receipt_sha256);
end;
$$;
revoke all on function public.accept_my_district_agreement(uuid,text,text,text,boolean,boolean,boolean)
from public,anon;
grant execute on function public.accept_my_district_agreement(uuid,text,text,text,boolean,boolean,boolean)
to authenticated;

create function public.list_my_district_agreement_receipts()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
begin
  v_actor:=safebus_private.agreement_actor('tenant_admin');
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'package_id',r.package_id,'signed_at',r.signed_at,
    'receipt_sha256',r.receipt_sha256,'bundle_sha256',r.bundle_sha256,
    'actor_email',r.actor_email) order by r.signed_at desc),'[]'::jsonb)
    from safebus_private.agreement_executed_artifacts r
    where r.tenant_id=v_actor.tenant_id);
end;
$$;
revoke all on function public.list_my_district_agreement_receipts() from public,anon;
grant execute on function public.list_my_district_agreement_receipts() to authenticated;

create function public.get_my_district_agreement_receipt(p_receipt_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;v_receipt safebus_private.agreement_executed_artifacts;
begin
  v_actor:=safebus_private.agreement_actor('tenant_admin');
  select * into v_receipt from safebus_private.agreement_executed_artifacts
    where id=p_receipt_id and tenant_id=v_actor.tenant_id;
  if not found then raise exception 'Executed agreement not found.' using errcode='42501'; end if;
  return jsonb_build_object('id',v_receipt.id,'signed_at',v_receipt.signed_at,
    'receipt_sha256',v_receipt.receipt_sha256,'bundle_sha256',v_receipt.bundle_sha256,
    'document_snapshot',v_receipt.document_snapshot);
end;
$$;
revoke all on function public.get_my_district_agreement_receipt(uuid) from public,anon;
grant execute on function public.get_my_district_agreement_receipt(uuid) to authenticated;

create function public.district_agreement_billing_allowed(p_tenant_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,safebus_private,pg_temp as $$
  select not exists(select 1 from safebus_private.tenant_agreement_requirement
    where tenant_id=p_tenant_id)
    or exists(select 1 from safebus_private.agreement_packages
    where tenant_id=p_tenant_id and status='executed');
$$;
revoke all on function public.district_agreement_billing_allowed(uuid) from public,anon,authenticated;
grant execute on function public.district_agreement_billing_allowed(uuid) to service_role;

create function safebus_private.guard_new_tenant_operations()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp as $$
declare v_tenant uuid;
begin
  v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
  if not public.district_agreement_billing_allowed(v_tenant) then
    raise exception 'Accept the SafeBus MSA and DPA before creating transportation data.'
      using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function safebus_private.guard_new_tenant_operations() from public,anon,authenticated;

-- Database triggers protect new-tenant writes even if a privileged RPC bypasses
-- RLS. They do not affect grandfathered tenants; account creation is excluded.
do $$
declare t record;
begin
  for t in select c.table_name from information_schema.columns c
    where c.table_schema='public' and c.column_name='tenant_id'
      and c.table_name = any(array['students','guardians','drivers','buses',
        'schools','routes','route_stops','route_service_days','route_trip_patterns',
        'route_trip_stop_schedules','route_shapes','student_guardians',
        'student_bus_assignments','student_route_assignments',
        'student_qr_credentials','bus_qr_credentials','bus_admin_details',
        'bus_route_assignments','bus_run_dispatches','bus_tracking_sessions',
        'driver_route_assignments','driver_tracking_devices','driver_trips',
        'driver_trip_location_updates','driver_trip_current_locations',
        'student_trip_events','trip_exceptions','trip_operational_statuses',
        'pre_trip_confirmations','operational_notes','bulk_import_batches',
        'bulk_import_staging','guardian_notification_outbox',
        'push_notification_outbox','sis_integration_configs'])
  loop
    execute format('create trigger district_contract_write_gate
      before insert or update or delete on public.%I for each row
      execute function safebus_private.guard_new_tenant_operations()',t.table_name);
  end loop;
end;
$$;

comment on table safebus_private.agreement_executed_artifacts is
  'Immutable clickwrap acceptance evidence and complete signed package snapshot. PDF export renders this record; drafts are never seeded.';
