-- Pending protected release: role-specific invitation Terms of Use and privacy notice.
-- Reuses separately approved immutable acceptable_use document versions; does not publish drafts.
-- Existing driver/guardian profiles are grandfathered. No customer data is changed.
set local lock_timeout='1s';
set local statement_timeout='30s';

create table safebus_private.participant_terms_publication (
  singleton boolean primary key default true check(singleton),
  document_id uuid not null references safebus_private.agreement_document_versions(id),
  published_at timestamptz not null default statement_timestamp(),
  published_by uuid not null references auth.users(id)
);
alter table safebus_private.participant_terms_publication enable row level security;
revoke all on safebus_private.participant_terms_publication from public, anon, authenticated;

create table safebus_private.participant_agreement_requirements (
  profile_id uuid primary key references public.profiles(id),
  required_role text not null check(required_role in ('driver','guardian')),
  required_since timestamptz not null default statement_timestamp()
);
alter table safebus_private.participant_agreement_requirements enable row level security;
revoke all on safebus_private.participant_agreement_requirements from public, anon, authenticated;

create table safebus_private.participant_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  tenant_id uuid not null references public.tenants(id),
  role text not null check(role in ('driver','guardian')),
  document_id uuid not null references safebus_private.agreement_document_versions(id),
  terms_version text not null,
  terms_sha256 text not null check(terms_sha256 ~ '^[0-9a-f]{64}$'),
  terms_snapshot text not null,
  notice_version text not null,
  notice_url text not null,
  actor_session_id uuid not null,
  accepted_at timestamptz not null default statement_timestamp(),
  terms_affirmed boolean not null check(terms_affirmed),
  privacy_notice_acknowledged boolean not null check(privacy_notice_acknowledged),
  receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
  unique(profile_id, document_id)
);
create index participant_agreement_acceptances_profile
  on safebus_private.participant_agreement_acceptances(profile_id,accepted_at desc);
alter table safebus_private.participant_agreement_acceptances enable row level security;
revoke all on safebus_private.participant_agreement_acceptances from public, anon, authenticated;
create trigger participant_agreement_receipts_immutable
  before update or delete on safebus_private.participant_agreement_acceptances
  for each row execute function safebus_private.agreement_immutable();

create function safebus_private.require_participant_agreement()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,safebus_private,pg_temp as $
declare v_changed boolean;
begin
  if tg_op='INSERT' then
    v_changed:=true;
  else
    v_changed:=old.role::text is distinct from new.role::text;
  end if;
  if new.role::text in ('driver','guardian') and v_changed then
    insert into safebus_private.participant_agreement_requirements(profile_id,required_role)
    values(new.id,new.role::text)
    on conflict(profile_id) do update set
      required_role=excluded.required_role,
      required_since=statement_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function safebus_private.require_participant_agreement()
  from public,anon,authenticated;
create trigger require_terms_for_new_participants
  after insert or update of role on public.profiles
  for each row when (new.role::text in ('driver','guardian'))
  execute function safebus_private.require_participant_agreement();

create function safebus_private.current_participant_agreement_actor()
returns public.profiles language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
begin
  if auth.uid() is null or not public.is_current_user_session_active() then
    raise exception 'Active session required.' using errcode='42501';
  end if;
  select * into v_actor from public.profiles p
   where p.id=auth.uid() and p.status='active'
     and p.role::text in ('driver','guardian');
  if not found or not exists (
    select 1 from public.tenants t
     where t.id=v_actor.tenant_id and t.status='active'
  ) then
    raise exception 'Active driver or guardian account required.' using errcode='42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function safebus_private.current_participant_agreement_actor()
  from public,anon,authenticated;

-- Publication is deliberately separate from the district's eight-document catalog.
-- Only the platform administrator with MFA may elect an independently approved AUP.
create function public.platform_publish_participant_terms(p_document_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
declare v_doc safebus_private.agreement_document_versions;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  select * into v_doc from safebus_private.agreement_document_versions
    where id=p_document_id and kind='acceptable_use';
  if not found then
    raise exception 'Select a finalized Acceptable Use document.' using errcode='22023';
  end if;
  insert into safebus_private.participant_terms_publication(
    singleton,document_id,published_at,published_by)
  values(true,v_doc.id,statement_timestamp(),v_actor.id)
  on conflict(singleton) do update set
    document_id=excluded.document_id,published_at=excluded.published_at,
    published_by=excluded.published_by;
  return jsonb_build_object('published',true,'document_id',v_doc.id,
     'version',v_doc.version,'sha256',v_doc.sha256);
end;
$$;
revoke all on function public.platform_publish_participant_terms(uuid)
  from public,anon;
grant execute on function public.platform_publish_participant_terms(uuid) to authenticated;

create function public.platform_get_participant_terms()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
begin
  v_actor:=safebus_private.agreement_actor('platform_super_admin');
  return coalesce((
    select jsonb_build_object('status','published','document_id',d.id,
      'version',d.version,'title',d.title,'sha256',d.sha256,'published_at',p.published_at)
    from safebus_private.participant_terms_publication p
    join safebus_private.agreement_document_versions d on d.id=p.document_id
    where p.singleton=true
  ), jsonb_build_object('status','not_published'));
end;
$$;
revoke all on function public.platform_get_participant_terms()
  from public,anon;
grant execute on function public.platform_get_participant_terms() to authenticated;

create function public.get_my_participant_agreement()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
declare v_requirement safebus_private.participant_agreement_requirements;
declare v_document safebus_private.agreement_document_versions;
declare v_acceptance safebus_private.participant_agreement_acceptances;
declare v_notice_url text;
declare v_notice_version text;
begin
  v_actor:=safebus_private.current_participant_agreement_actor();
  select * into v_requirement from safebus_private.participant_agreement_requirements
    where profile_id=v_actor.id and required_role=v_actor.role::text;
  if not found then
    return jsonb_build_object('required',false,'status','grandfathered');
  end if;
  select d.* into v_document
    from safebus_private.participant_terms_publication p
    join safebus_private.agreement_document_versions d on d.id=p.document_id
    where p.singleton=true and d.kind='acceptable_use';
  if not found then
    return jsonb_build_object('required',true,'status','not_published');
  end if;
  v_notice_url:=case when v_actor.role::text='driver'
    then '/privacy#drivers' else '/privacy#guardians' end;
  v_notice_version:=case when v_actor.role::text='driver'
    then 'driver-2026-11-05-v1' else 'guardian-2026-11-05-v1' end;
  select * into v_acceptance from safebus_private.participant_agreement_acceptances
    where profile_id=v_actor.id and role=v_actor.role::text
      and document_id=v_document.id;
  return jsonb_build_object(
    'required',true,
    'status',case when v_acceptance.id is null then 'pending' else 'accepted' end,
    'terms',jsonb_build_object('id',v_document.id,'title',v_document.title,
      'version',v_document.version,'sha256',v_document.sha256,
      'body',v_document.body_markdown),
    'notice',jsonb_build_object('url',v_notice_url,'version',v_notice_version),
    'accepted_at',v_acceptance.accepted_at
  );
end;
$$;
revoke all on function public.get_my_participant_agreement() from public,anon;
grant execute on function public.get_my_participant_agreement() to authenticated;

create function public.accept_my_participant_agreement(
  p_document_id uuid,p_terms_sha256 text,
  p_terms_accepted boolean,p_notice_acknowledged boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,safebus_private,pg_temp as $$
declare v_actor public.profiles;
declare v_doc safebus_private.agreement_document_versions;
declare v_existing safebus_private.participant_agreement_acceptances;
declare v_session uuid;
declare v_notice_url text;
declare v_notice_version text;
declare v_snapshot jsonb;
declare v_receipt_sha text;
begin
  v_actor:=safebus_private.current_participant_agreement_actor();
  if not coalesce(p_terms_accepted,false) or
     not coalesce(p_notice_acknowledged,false) then
    raise exception 'Review and affirm Terms of Use and acknowledge the Privacy Notice.';
  end if;
  if not exists (
    select 1 from safebus_private.participant_agreement_requirements r
    where r.profile_id=v_actor.id and r.required_role=v_actor.role::text
  ) then
    return jsonb_build_object('status','not_required');
  end if;
  begin
    v_session:=(auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Active session required.' using errcode='42501';
  end;
  if v_session is null then
    raise exception 'Active session required.' using errcode='42501';
  end if;
  select d.* into v_doc from safebus_private.participant_terms_publication p
    join safebus_private.agreement_document_versions d on d.id=p.document_id
    where p.singleton=true and d.kind='acceptable_use'
      and d.id=p_document_id and d.sha256=p_terms_sha256;
  if not found then
    raise exception 'Terms changed. Reload and review the current version.';
  end if;
  v_notice_url:=case when v_actor.role::text='driver'
    then '/privacy#drivers' else '/privacy#guardians' end;
  v_notice_version:=case when v_actor.role::text='driver'
    then 'driver-2026-11-05-v1' else 'guardian-2026-11-05-v1' end;
  select * into v_existing from safebus_private.participant_agreement_acceptances
    where profile_id=v_actor.id and document_id=v_doc.id;
  if found then
    return jsonb_build_object('status','accepted','receipt_sha256',v_existing.receipt_sha256,
      'accepted_at',v_existing.accepted_at,'replayed',true);
  end if;
  v_snapshot:=jsonb_build_object('profile_id',v_actor.id,'tenant_id',v_actor.tenant_id,
    'role',v_actor.role::text,'document_id',v_doc.id,'terms_version',v_doc.version,
    'terms_sha256',v_doc.sha256,'terms_body',v_doc.body_markdown,
    'notice_url',v_notice_url,'notice_version',v_notice_version,
    'actor_session_id',v_session,'accepted_at',statement_timestamp(),
    'terms_accepted',true,'notice_acknowledged',true);
  v_receipt_sha:=encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex');
  insert into safebus_private.participant_agreement_acceptances(
    profile_id,tenant_id,role,document_id,terms_version,terms_sha256,terms_snapshot,
    notice_version,notice_url,actor_session_id,terms_affirmed,
    privacy_notice_acknowledged,receipt_sha256)
  values(v_actor.id,v_actor.tenant_id,v_actor.role::text,v_doc.id,v_doc.version,
    v_doc.sha256,v_doc.body_markdown,v_notice_version,v_notice_url,v_session,
    true,true,v_receipt_sha)
  on conflict(profile_id,document_id) do nothing;
  select * into v_existing from safebus_private.participant_agreement_acceptances
    where profile_id=v_actor.id and document_id=v_doc.id;
  if v_existing.role<>v_actor.role::text or
     v_existing.tenant_id<>v_actor.tenant_id or
     v_existing.terms_sha256<>v_doc.sha256 then
    raise exception 'Agreement identity mismatch.' using errcode='42501';
  end if;
  return jsonb_build_object('status','accepted','receipt_sha256',v_existing.receipt_sha256,
    'accepted_at',v_existing.accepted_at);
end;
$$;
revoke all on function public.accept_my_participant_agreement(uuid,text,boolean,boolean)
  from public,anon;
grant execute on function public.accept_my_participant_agreement(uuid,text,boolean,boolean)
  to authenticated;

comment on table safebus_private.participant_agreement_requirements is
  'New driver and guardian profiles only; original profiles grandfathered without retroactive account lockout.';
comment on table safebus_private.participant_agreement_acceptances is
  'Immutable per-profile acceptance of exact approved Terms of Use, separate from privacy notice acknowledgment. Not location/notification consent.';
