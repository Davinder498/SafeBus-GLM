-- Prepared only. Reconcile, rehearse and release through the protected workflow.
-- Source metadata is organizational reference data, never an account or recipient.
create table safebus_private.authority_reference_directory (
  authority_code text primary key check (authority_code ~ '^[0-9]{4}$'),
  official_name text not null check (length(official_name) between 2 and 200),
  authority_category text not null check (length(authority_category) between 1 and 100),
  address text check (length(address) <= 600),
  city text check (length(city) <= 100),
  province text check (province is null or province = 'AB'),
  postal_code text check (length(postal_code) <= 12),
  email text check (length(email) <= 320),
  phone text check (length(phone) <= 40),
  website_url text check (length(website_url) <= 500 and website_url ~ '^https?://'),
  source_url text not null,
  source_extract_date date not null,
  imported_at timestamptz not null default now(),
  available boolean not null default true
);
create table safebus_private.authority_directory_import_state (
  singleton boolean primary key default true check (singleton),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_extract_date date not null,
  record_count integer not null check (record_count between 1 and 5000),
  imported_at timestamptz not null default now()
);
alter table safebus_private.authority_reference_directory enable row level security;
alter table safebus_private.authority_directory_import_state enable row level security;
revoke all on safebus_private.authority_reference_directory,
  safebus_private.authority_directory_import_state from public, anon, authenticated, service_role;

alter table public.tenants add column authority_code text
  references safebus_private.authority_reference_directory(authority_code);
create unique index tenants_authority_code_unique on public.tenants(authority_code)
  where authority_code is not null;
alter table public.tenant_support_contacts add column address text
  check (address is null or length(address) <= 600);

create function safebus_private.validate_authority_support(p_contact jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_contact is null or jsonb_typeof(p_contact) <> 'object'
    or nullif(btrim(p_contact->>'displayName'), '') is null
    or length(btrim(p_contact->>'displayName')) > 120
    or nullif(btrim(p_contact->>'email'), '') is null
    or length(btrim(p_contact->>'email')) > 320
    or btrim(p_contact->>'email') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    or length(coalesce(p_contact->>'phone','')) > 40
    or length(coalesce(p_contact->>'websiteUrl','')) > 500
    or (nullif(btrim(p_contact->>'websiteUrl'),'') is not null
        and btrim(p_contact->>'websiteUrl') !~ '^https://[^[:space:]]+$')
    or length(coalesce(p_contact->>'supportHours','')) > 240
    or length(coalesce(p_contact->>'instructions','')) > 1000
    or length(coalesce(p_contact->>'address','')) > 600 then
    raise exception 'Enter valid school authority support details.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function safebus_private.validate_authority_support(jsonb)
  from public, anon, authenticated, service_role;

create function safebus_private.check_authority_onboarding(
  p_authority_code text, p_support_contact jsonb, p_support_confirmed boolean
) returns void language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null
    or safebus_private.is_platform_super_admin() is distinct from true
    or public.is_current_user_session_active() is distinct from true then
    raise exception 'Only an active platform administrator can onboard an authority.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  perform safebus_private.enforce_recent_auth_for_sensitive_action();
  if p_support_confirmed is distinct from true then
    raise exception 'Confirm the support details before sending the invitation.' using errcode = '22023';
  end if;
  perform safebus_private.validate_authority_support(p_support_contact);
  if p_authority_code is not null then
    -- Serializes finalization with other invitations and directory refreshes.
    perform 1 from safebus_private.authority_reference_directory
      where authority_code = p_authority_code and available for update;
    if not found then
      raise exception 'Choose an available authority or use manual entry.' using errcode = '22023';
    end if;
    if exists(select 1 from public.tenants where authority_code = p_authority_code) then
      raise exception 'This authority already has a SafeBus account.' using errcode = '23505';
    end if;
  end if;
end;
$$;
revoke all on function safebus_private.check_authority_onboarding(text,jsonb,boolean)
  from public, anon, authenticated, service_role;

create function public.search_authority_reference_directory(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or safebus_private.is_platform_super_admin() is distinct from true
    or public.is_current_user_session_active() is distinct from true then
    raise exception 'Only an active platform administrator can search authorities.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  if p_query is null or length(btrim(p_query)) < 2 then return '[]'::jsonb; end if;
  if length(p_query) > 100 then raise exception 'Search is too long.' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(result.item order by result.official_name,result.authority_code)
    from (select d.official_name,d.authority_code,jsonb_build_object(
      'authorityCode',d.authority_code,'officialName',d.official_name,
      'authorityCategory',d.authority_category,'address',d.address,'city',d.city,
      'province',d.province,'postalCode',d.postal_code,'email',d.email,'phone',d.phone,
      'websiteUrl',d.website_url,'sourceExtractDate',d.source_extract_date,
      'importedAt',d.imported_at,'sourceUrl',d.source_url,
      'alreadyLinked',exists(select 1 from public.tenants t where t.authority_code=d.authority_code)
    ) as item from safebus_private.authority_reference_directory d
    where d.available and (
      position(lower(btrim(p_query)) in lower(d.official_name)) > 0
      or position(lower(btrim(p_query)) in lower(d.authority_code)) > 0
      or position(lower(btrim(p_query)) in lower(coalesce(d.city,''))) > 0
    ) order by d.official_name,d.authority_code limit 20) result),'[]'::jsonb);
end;
$$;

create function public.platform_check_authority_onboarding(
  p_authority_code text, p_support_contact jsonb, p_support_confirmed boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform safebus_private.check_authority_onboarding(p_authority_code,p_support_contact,p_support_confirmed);
  return true;
end;
$$;

create function public.platform_finalize_tenant_invitation_v2(
  p_auth_user_id uuid, p_tenant_name text, p_tenant_type text,
  p_admin_name text, p_admin_email text, p_authority_code text,
  p_support_contact jsonb, p_support_confirmed boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_tenant_id uuid; v_name text := btrim(p_tenant_name);
begin
  perform safebus_private.check_authority_onboarding(p_authority_code,p_support_contact,p_support_confirmed);
  -- Delegate all existing invitation/provisioning rules and triggers unchanged.
  if p_authority_code is not null then
    select official_name into v_name from safebus_private.authority_reference_directory
      where authority_code=p_authority_code;
  end if;
  v_result := public.platform_finalize_tenant_invitation(
    p_auth_user_id,v_name,p_tenant_type,null,null,p_admin_name,p_admin_email);
  v_tenant_id := (v_result->'tenant'->>'id')::uuid;
  if v_tenant_id is null then raise exception 'Authority provisioning failed.'; end if;
  update public.tenants set authority_code=p_authority_code where id=v_tenant_id;
  insert into public.tenant_support_contacts(
    tenant_id,display_name,email,phone,website_url,support_hours,instructions,address,updated_by
  ) values (
    v_tenant_id,btrim(p_support_contact->>'displayName'),lower(btrim(p_support_contact->>'email')),
    nullif(btrim(p_support_contact->>'phone'),''),nullif(btrim(p_support_contact->>'websiteUrl'),''),
    nullif(btrim(p_support_contact->>'supportHours'),''),nullif(btrim(p_support_contact->>'instructions'),''),
    nullif(btrim(p_support_contact->>'address'),''),auth.uid()
  );
  perform safebus_private.phase5_write_audit_event(auth.uid(),'tenant_support.updated','tenant',
    v_tenant_id,btrim(p_support_contact->>'displayName'),
    jsonb_build_object('source','authority_onboarding','authority_code',p_authority_code));
  return v_result;
end;
$$;

-- Correct the existing escaped-dot validation while preserving this signature,
-- authorization, audit behavior, and any address saved by newer clients.
create or replace function public.update_tenant_support_contact(
  p_display_name text,p_email text,p_phone text,p_website_url text,
  p_support_hours text,p_instructions text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null or safebus_private.current_user_role() is distinct from 'tenant_admin'::public.user_role then
    raise exception 'Only a tenant administrator can update tenant support.' using errcode='42501';
  end if;
  v_tenant_id := safebus_private.current_tenant_id();
  if v_tenant_id is null then raise exception 'A tenant is required.' using errcode='42501'; end if;
  perform safebus_private.enforce_mfa_if_required();
  perform safebus_private.enforce_recent_auth_for_sensitive_action();
  perform safebus_private.validate_authority_support(jsonb_build_object(
    'displayName',p_display_name,'email',p_email,'phone',p_phone,'websiteUrl',p_website_url,
    'supportHours',p_support_hours,'instructions',p_instructions));
  insert into public.tenant_support_contacts(tenant_id,display_name,email,phone,website_url,support_hours,instructions,updated_by)
  values(v_tenant_id,btrim(p_display_name),lower(btrim(p_email)),nullif(btrim(p_phone),''),
    nullif(btrim(p_website_url),''),nullif(btrim(p_support_hours),''),nullif(btrim(p_instructions),''),auth.uid())
  on conflict(tenant_id) do update set display_name=excluded.display_name,email=excluded.email,
    phone=excluded.phone,website_url=excluded.website_url,support_hours=excluded.support_hours,
    instructions=excluded.instructions,updated_by=auth.uid(),updated_at=now();
  perform safebus_private.phase5_write_audit_event(auth.uid(),'tenant_support.updated','tenant',v_tenant_id,btrim(p_display_name),'{}'::jsonb);
end;
$$;

create function public.update_tenant_support_contact_v2(
  p_display_name text,p_email text,p_phone text,p_website_url text,
  p_support_hours text,p_instructions text,p_address text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_address,'')) > 600 then
    raise exception 'Address is too long.' using errcode='22023';
  end if;
  perform public.update_tenant_support_contact(p_display_name,p_email,p_phone,p_website_url,p_support_hours,p_instructions);
  update public.tenant_support_contacts set address=nullif(btrim(p_address),'')
    where tenant_id=safebus_private.current_tenant_id();
end;
$$;

create function public.get_support_directory_v2()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_address text;
begin
  -- Retain the existing role-scoped contact chain, including the platform fallback.
  v_result := public.get_support_directory();
  if safebus_private.current_user_role() in ('tenant_admin','driver','guardian') then
    select address into v_address from public.tenant_support_contacts
      where tenant_id=safebus_private.current_tenant_id();
    if v_result->'tenant' is distinct from 'null'::jsonb then
      v_result := jsonb_set(v_result,'{tenant,address}',coalesce(to_jsonb(v_address),'null'::jsonb));
    end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.search_authority_reference_directory(text),
  public.platform_check_authority_onboarding(text,jsonb,boolean),
  public.platform_finalize_tenant_invitation_v2(uuid,text,text,text,text,text,jsonb,boolean),
  public.update_tenant_support_contact(text,text,text,text,text,text),
  public.update_tenant_support_contact_v2(text,text,text,text,text,text,text),
  public.get_support_directory_v2() from public,anon,authenticated,service_role;
grant execute on function public.search_authority_reference_directory(text),
  public.platform_check_authority_onboarding(text,jsonb,boolean),
  public.platform_finalize_tenant_invitation_v2(uuid,text,text,text,text,text,jsonb,boolean),
  public.update_tenant_support_contact(text,text,text,text,text,text),
  public.update_tenant_support_contact_v2(text,text,text,text,text,text,text),
  public.get_support_directory_v2() to authenticated;
