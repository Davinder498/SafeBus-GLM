-- Forward-only customer Order Form snapshots. No contract wording is published here.
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table safebus_private.agreement_packages add column order_details jsonb;
alter table safebus_private.agreement_packages add column order_revision integer not null default 1 check(order_revision>0);
alter table safebus_private.agreement_packages drop constraint agreement_packages_tenant_id_revision_key;
alter table safebus_private.agreement_packages add unique(tenant_id,revision,order_revision);

create function safebus_private.agreement_order_documents(p_package safebus_private.agreement_packages)
returns jsonb language sql stable security definer
set search_path=pg_catalog,safebus_private,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'kind',d.kind,'title',d.title,'version',d.version,
    'sha256',encode(sha256(convert_to(d.body,'UTF8')),'hex'),'body',d.body
  ) order by d.kind),'[]'::jsonb)
  from (select v.id,v.kind,v.title,v.version,
    v.body_markdown || case when v.kind='order_form' and p_package.order_details is not null
      then E'\n\n## Your school authority order\n\n' || jsonb_pretty(p_package.order_details)
      else '' end as body
    from safebus_private.agreement_document_versions v
    where v.id=any(p_package.document_ids)) d;
$$;
revoke all on function safebus_private.agreement_order_documents(safebus_private.agreement_packages) from public,anon,authenticated,service_role;

create function public.prepare_my_district_agreement_order(p_package_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare a public.profiles; p safebus_private.agreement_packages; c safebus_private.agreement_catalog;
declare quantity integer; interval_value text; method text; details jsonb; key text;
begin
  a:=safebus_private.agreement_actor('tenant_admin');
  -- Lock ordering matches package generation; signing also locks the package.
  perform 1 from public.tenants where id=a.tenant_id for update;
  select * into p from safebus_private.agreement_packages
    where id=p_package_id and tenant_id=a.tenant_id for update;
  if not found or p.status not in('issued','executed') then raise exception 'A current agreement is required.'; end if;
  select * into c from safebus_private.agreement_catalog where id=true for share;
  if c.revision is distinct from p.revision then raise exception 'Agreement changed. Refresh before preparing your order.'; end if;
  if jsonb_typeof(p_order) is distinct from 'object' then raise exception 'Complete your order details.'; end if;
  if exists(select 1 from jsonb_object_keys(p_order) k where k not in
    ('interval','quantity','collection_method','privacy_contact','urgent_contact')) then
    raise exception 'Unsupported order details.';
  end if;
  interval_value:=p_order->>'interval'; method:=p_order->>'collection_method';
  if interval_value is null or interval_value not in('month','year')
    or method is null or method not in('charge_automatically','send_invoice')
    or coalesce(p_order->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then
    raise exception 'Choose a billing interval, collection method and valid bus count.';
  end if;
  quantity:=(p_order->>'quantity')::integer;
  if quantity>10000 then raise exception 'Bus count must not exceed 10000.'; end if;
  foreach key in array array['privacy_contact','urgent_contact'] loop
    if jsonb_typeof(p_order->key) is distinct from 'string'
      or length(btrim(p_order->>key)) not between 5 and 254
      or btrim(p_order->>key) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Provide valid school authority privacy and urgent-contact email addresses.';
    end if;
  end loop;
  details:=jsonb_build_object(
    'customer',(select name from public.tenants where id=a.tenant_id),
    'tenant_id',a.tenant_id,'interval',interval_value,'quantity',quantity,
    'currency','CAD','unit_amount_cents',case when interval_value='month' then 199 else 2029 end,
    'tax_behavior','inclusive','collection_method',method,
    'privacy_contact',btrim(p_order->>'privacy_contact'),'urgent_contact',btrim(p_order->>'urgent_contact'),
    'service_geography','Alberta, Canada',
    'trial','One 14-day trial for eligible first-time authorities, starting only on confirmed subscription activation.',
    'service_start','After agreement acceptance and confirmed billing activation; trial and renewal dates appear in billing confirmation.',
    'invoice_condition','Invoice/PO collection requires separate SafeBus approval and authority confirmation of the invoice details before activation.',
    'return_arrangements','Included scoped assisted return through SafeBus support; agree verified recipient, secure machine-readable format and completion date. Holds and documented supplier expiry apply; no automatic purge.',
    'supplier_document_sha256',(select sha256 from safebus_private.agreement_document_versions where id=any(p.document_ids) and kind='suppliers')
  );
  -- An accepted order is never rewritten: editing starts a separately signed amendment.
  if p.status='executed' then
    if exists(select 1 from safebus_private.agreement_packages x where x.tenant_id=a.tenant_id and x.revision=c.revision and x.order_revision>p.order_revision) then
      raise exception 'An updated order already exists. Refresh your agreement.';
    end if;
    insert into safebus_private.agreement_packages(tenant_id,revision,order_revision,document_ids,bundle_sha256,issued_by)
      values(a.tenant_id,c.revision,p.order_revision+1,c.document_ids,p.bundle_sha256,c.published_by)
      returning * into p;
  end if;
  update safebus_private.agreement_packages set order_details=details,
    bundle_sha256=encode(sha256(convert_to(a.tenant_id::text || ':' || p.revision::text || ':' || c.content_sha256 || ':' || details::text,'UTF8')),'hex')
    where id=p.id;
  return public.get_my_district_agreement();
end;
$$;
revoke all on function public.prepare_my_district_agreement_order(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.prepare_my_district_agreement_order(uuid,jsonb) to authenticated;

create or replace function safebus_private.ensure_district_agreement(p_tenant_id uuid,p_actor uuid)
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
    where tenant_id=p_tenant_id and revision=v_catalog.revision order by order_revision desc limit 1;
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

create or replace function public.get_my_district_agreement()
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
  v_docs:=safebus_private.agreement_order_documents(v_package);
  return jsonb_build_object('id',v_package.id,'status',v_package.status,
    'version',v_package.revision::text || '.' || v_package.order_revision::text,'revision',v_package.revision,
    'tenant_name',(select name from public.tenants where id=v_actor.tenant_id),
    'bundle_sha256',v_package.bundle_sha256,'issued_at',v_package.issued_at,
    'customer_signed_at',v_package.accepted_at,'documents',v_docs,
    'order_required',true,'order_details',v_package.order_details,
    'receipt_id',(select id from safebus_private.agreement_executed_artifacts
      where package_id=v_package.id));
end;
$$;

create or replace function public.accept_my_district_agreement(
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
  if exists(select 1 from safebus_private.agreement_packages x where x.tenant_id=v_actor.tenant_id and x.revision=v_package.revision and x.order_revision>v_package.order_revision) then raise exception 'A newer order exists. Refresh your agreement.'; end if;
  perform 1 from safebus_private.agreement_catalog where id=true for share;
  if not exists (
    select 1 from safebus_private.agreement_catalog c
      where c.id=true and c.revision=v_package.revision
  ) then
    raise exception 'The agreement was updated. Refresh and accept the current version.';
  end if;
  if v_package.order_details is null then raise exception 'Complete and review your school authority Order Form before acceptance.'; end if;
  v_docs:=safebus_private.agreement_order_documents(v_package);
  if jsonb_array_length(v_docs)<>8 then raise exception 'Incomplete approved contract package.'; end if;
  select encode(sha256(convert_to(v_actor.tenant_id::text || ':' ||
    v_package.revision::text || ':' || c.content_sha256 || ':' || v_package.order_details::text,'UTF8')),'hex')
    into v_hash from safebus_private.agreement_catalog c
    where c.id=true and c.revision=v_package.revision;
  if v_hash is distinct from v_package.bundle_sha256 then
    raise exception 'Agreement content integrity verification failed.';
  end if;
  v_snapshot:=jsonb_build_object(
    'provider','Sachman Gold Inc. (SafeBus)',
    'customer',(select t.name from public.tenants t where t.id=v_actor.tenant_id),
    'package_id',v_package.id,'revision',v_package.revision,
    'bundle_sha256',v_package.bundle_sha256,
    'order_details',v_package.order_details,'documents',v_docs,'signer',jsonb_build_object(
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

create function public.district_agreement_order_matches(p_tenant_id uuid,p_interval text,p_quantity integer,p_collection_method text)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,safebus_private,pg_temp as $$
  select not exists(select 1 from safebus_private.tenant_agreement_requirement where tenant_id=p_tenant_id)
    or exists(select 1 from safebus_private.agreement_executed_artifacts r
      where r.tenant_id=p_tenant_id and r.document_snapshot->'order_details'->>'interval'=p_interval
      and (r.document_snapshot->'order_details'->>'quantity')::integer=p_quantity
      and r.document_snapshot->'order_details'->>'collection_method'=p_collection_method
      and r.id=(select x.id from safebus_private.agreement_executed_artifacts x join safebus_private.agreement_packages p on p.id=x.package_id where x.tenant_id=p_tenant_id order by p.revision desc,p.order_revision desc limit 1));
$$;
revoke all on function public.district_agreement_order_matches(uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.district_agreement_order_matches(uuid,text,integer,text) to service_role;

notify pgrst,'reload schema';
