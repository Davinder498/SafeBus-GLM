-- Give drivers and guardians a verified support path when their tenant has
-- not published a dedicated contact. The platform contact is already the
-- approved fallback named by the mobile privacy/account experience.

create or replace function public.get_support_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_tenant_id uuid;
  v_platform jsonb;
  v_tenant jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Support directory requires an active login.' using errcode = '42501';
  end if;

  v_role := public.current_user_role();
  v_tenant_id := public.current_tenant_id();

  if v_role is null then
    raise exception 'Support directory requires an active profile.' using errcode = '42501';
  end if;

  if v_role in ('platform_super_admin', 'tenant_admin') then
    select jsonb_build_object(
      'displayName', contact.display_name,
      'email', contact.email,
      'phone', contact.phone,
      'websiteUrl', contact.website_url,
      'supportHours', contact.support_hours,
      'instructions', contact.instructions,
      'updatedAt', contact.updated_at
    )
    into v_platform
    from public.platform_support_contacts contact
    where contact.id = true;
  end if;

  if v_role in ('tenant_admin', 'driver', 'guardian') and v_tenant_id is not null then
    select jsonb_build_object(
      'displayName', contact.display_name,
      'email', contact.email,
      'phone', contact.phone,
      'websiteUrl', contact.website_url,
      'supportHours', contact.support_hours,
      'instructions', contact.instructions,
      'updatedAt', contact.updated_at
    )
    into v_tenant
    from public.tenant_support_contacts contact
    where contact.tenant_id = v_tenant_id;
  end if;

  -- Platform contact details are published business support information. Put
  -- the fallback in the tenant slot so recipient apps expose only one contact.
  if v_role in ('driver', 'guardian') and v_tenant is null then
    select jsonb_build_object(
      'displayName', contact.display_name,
      'email', contact.email,
      'phone', contact.phone,
      'websiteUrl', contact.website_url,
      'supportHours', contact.support_hours,
      'instructions', contact.instructions,
      'updatedAt', contact.updated_at
    )
    into v_tenant
    from public.platform_support_contacts contact
    where contact.id = true;
  end if;

  return jsonb_build_object('platform', v_platform, 'tenant', v_tenant);
end;
$$;

revoke all on function public.get_support_directory() from public, anon;
grant execute on function public.get_support_directory() to authenticated;

comment on function public.get_support_directory() is
  'Returns the role-scoped support directory. Drivers and guardians receive the published platform contact only when their tenant has no dedicated support contact.';
