create table public.platform_support_contacts (
  id boolean primary key default true check (id),
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 320),
  phone text check (phone is null or char_length(trim(phone)) between 1 and 40),
  website_url text check (website_url is null or (char_length(website_url) <= 500 and website_url ~ '^https://')),
  support_hours text check (support_hours is null or char_length(support_hours) <= 240),
  instructions text check (instructions is null or char_length(instructions) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.tenant_support_contacts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 320),
  phone text check (phone is null or char_length(trim(phone)) between 1 and 40),
  website_url text check (website_url is null or (char_length(website_url) <= 500 and website_url ~ '^https://')),
  support_hours text check (support_hours is null or char_length(support_hours) <= 240),
  instructions text check (instructions is null or char_length(instructions) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_support_contacts enable row level security;
alter table public.tenant_support_contacts enable row level security;
revoke all on public.platform_support_contacts, public.tenant_support_contacts from public, anon, authenticated;

create or replace function public.get_support_directory()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role public.user_role;
  v_tenant_id uuid;
  v_platform jsonb;
  v_tenant jsonb;
begin
  if auth.uid() is null then raise exception 'Support directory requires an active login.' using errcode = '42501'; end if;
  v_role := public.current_user_role();
  v_tenant_id := public.current_tenant_id();
  if v_role is null then raise exception 'Support directory requires an active profile.' using errcode = '42501'; end if;

  -- Platform administrators publish the contact that tenant administrators use.
  if v_role in ('platform_super_admin', 'tenant_admin') then
    select jsonb_build_object('displayName', display_name, 'email', email, 'phone', phone,
      'websiteUrl', website_url, 'supportHours', support_hours, 'instructions', instructions,
      'updatedAt', updated_at) into v_platform from public.platform_support_contacts where id = true;
  end if;

  -- Tenant administrators maintain the contact shown to their own drivers and guardians.
  if v_role in ('tenant_admin', 'driver', 'guardian') and v_tenant_id is not null then
    select jsonb_build_object('displayName', display_name, 'email', email, 'phone', phone,
      'websiteUrl', website_url, 'supportHours', support_hours, 'instructions', instructions,
      'updatedAt', updated_at) into v_tenant from public.tenant_support_contacts where tenant_id = v_tenant_id;
  end if;
  return jsonb_build_object('platform', v_platform, 'tenant', v_tenant);
end $$;

create or replace function public.update_platform_support_contact(
  p_display_name text, p_email text, p_phone text, p_website_url text,
  p_support_hours text, p_instructions text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'platform_super_admin'::public.user_role then
    raise exception 'Only a platform administrator can update platform support.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  if nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 120
    or nullif(trim(p_email), '') is null or length(trim(p_email)) > 320
    or trim(p_email) !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
    or length(coalesce(trim(p_phone), '')) > 40
    or length(coalesce(trim(p_support_hours), '')) > 240
    or length(coalesce(trim(p_instructions), '')) > 1000
    or (nullif(trim(p_website_url), '') is not null and (length(trim(p_website_url)) > 500 or trim(p_website_url) !~ '^https://')) then
    raise exception 'Enter valid support contact details.' using errcode = '22023';
  end if;
  insert into public.platform_support_contacts(id, display_name, email, phone, website_url, support_hours, instructions, updated_by)
  values (true, trim(p_display_name), lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(trim(p_website_url), ''), nullif(trim(p_support_hours), ''), nullif(trim(p_instructions), ''), auth.uid())
  on conflict (id) do update set display_name = excluded.display_name, email = excluded.email,
    phone = excluded.phone, website_url = excluded.website_url, support_hours = excluded.support_hours,
    instructions = excluded.instructions, updated_by = auth.uid(), updated_at = now();
  perform public.phase5_write_audit_event(auth.uid(), 'platform_support.updated', 'support_contact', auth.uid(), trim(p_display_name), '{}'::jsonb);
end $$;

create or replace function public.update_tenant_support_contact(
  p_display_name text, p_email text, p_phone text, p_website_url text,
  p_support_hours text, p_instructions text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'tenant_admin'::public.user_role then
    raise exception 'Only a tenant administrator can update tenant support.' using errcode = '42501';
  end if;
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then raise exception 'A tenant is required.' using errcode = '42501'; end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  if nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 120
    or nullif(trim(p_email), '') is null or length(trim(p_email)) > 320
    or trim(p_email) !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
    or length(coalesce(trim(p_phone), '')) > 40
    or length(coalesce(trim(p_support_hours), '')) > 240
    or length(coalesce(trim(p_instructions), '')) > 1000
    or (nullif(trim(p_website_url), '') is not null and (length(trim(p_website_url)) > 500 or trim(p_website_url) !~ '^https://')) then
    raise exception 'Enter valid support contact details.' using errcode = '22023';
  end if;
  insert into public.tenant_support_contacts(tenant_id, display_name, email, phone, website_url, support_hours, instructions, updated_by)
  values (v_tenant_id, trim(p_display_name), lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(trim(p_website_url), ''), nullif(trim(p_support_hours), ''), nullif(trim(p_instructions), ''), auth.uid())
  on conflict (tenant_id) do update set display_name = excluded.display_name, email = excluded.email,
    phone = excluded.phone, website_url = excluded.website_url, support_hours = excluded.support_hours,
    instructions = excluded.instructions, updated_by = auth.uid(), updated_at = now();
  perform public.phase5_write_audit_event(auth.uid(), 'tenant_support.updated', 'tenant', v_tenant_id, trim(p_display_name), '{}'::jsonb);
end $$;

revoke all on function public.get_support_directory() from public, anon;
revoke all on function public.update_platform_support_contact(text,text,text,text,text,text) from public, anon;
revoke all on function public.update_tenant_support_contact(text,text,text,text,text,text) from public, anon;
grant execute on function public.get_support_directory() to authenticated;
grant execute on function public.update_platform_support_contact(text,text,text,text,text,text) to authenticated;
grant execute on function public.update_tenant_support_contact(text,text,text,text,text,text) to authenticated;
