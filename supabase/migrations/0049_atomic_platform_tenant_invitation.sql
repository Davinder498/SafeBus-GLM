-- Make platform tenant onboarding visible only after the invitation provider
-- accepts the email and all SafeBus records are committed atomically.

create or replace function public.platform_find_unprofiled_auth_user(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Only an active platform super administrator can inspect onboarding accounts.';
  end if;

  if nullif(trim(p_email), '') is null then
    raise exception 'Administrator email is required.';
  end if;

  select jsonb_build_object(
    'id', u.id,
    'emailConfirmed', u.email_confirmed_at is not null,
    'hasPassword', nullif(u.encrypted_password, '') is not null
  )
  into v_result
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and not exists (
      select 1
      from public.profiles p
      where p.id = u.id
    )
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.platform_find_unprofiled_auth_user(text) from public, anon;
grant execute on function public.platform_find_unprofiled_auth_user(text) to authenticated;

comment on function public.platform_find_unprofiled_auth_user(text) is
  'Returns the minimum provider state needed to recover an exact-email Auth account that has no SafeBus profile. Platform super-admin only.';

create or replace function public.platform_finalize_tenant_invitation(
  p_auth_user_id uuid,
  p_tenant_name text,
  p_tenant_type text,
  p_school_name text,
  p_city text,
  p_admin_name text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
  v_school public.schools%rowtype;
  v_auth_email text;
  v_tenant_name text := trim(p_tenant_name);
  v_tenant_type text := trim(p_tenant_type);
  v_school_name text := nullif(trim(p_school_name), '');
  v_city text := nullif(trim(p_city), '');
  v_admin_name text := trim(p_admin_name);
  v_admin_email text := lower(trim(p_admin_email));
begin
  if not public.is_platform_super_admin() then
    raise exception 'Only an active platform super administrator can finalize tenant onboarding.';
  end if;

  if p_auth_user_id is null
    or nullif(v_tenant_name, '') is null
    or nullif(v_admin_name, '') is null
    or nullif(v_admin_email, '') is null then
    raise exception 'Tenant and administrator details are required.';
  end if;

  if v_tenant_type not in ('school', 'school_group', 'bus_contractor', 'demo')
    or length(v_tenant_name) > 200
    or length(coalesce(v_school_name, '')) > 200
    or length(coalesce(v_city, '')) > 100
    or length(v_admin_name) > 200
    or length(v_admin_email) > 320 then
    raise exception 'Tenant or administrator details are invalid.';
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> v_admin_email then
    raise exception 'The invited Auth account does not match the administrator email.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_auth_user_id
       or lower(p.email) = v_admin_email
  ) then
    raise exception 'The administrator email is already assigned to a SafeBus profile.';
  end if;

  insert into public.tenants (name, type, status)
  values (v_tenant_name, v_tenant_type, 'active')
  returning * into v_tenant;

  if v_school_name is not null then
    insert into public.schools (
      tenant_id,
      name,
      city,
      province,
      status
    )
    values (
      v_tenant.id,
      v_school_name,
      v_city,
      'AB',
      'active'
    )
    returning * into v_school;
  end if;

  insert into public.profiles (
    id,
    tenant_id,
    school_id,
    full_name,
    email,
    role,
    status
  )
  values (
    p_auth_user_id,
    v_tenant.id,
    v_school.id,
    v_admin_name,
    v_admin_email,
    'tenant_admin',
    'invited'
  );

  insert into public.tenant_onboarding_invitations (
    tenant_id,
    email,
    full_name,
    role,
    status,
    invited_profile_id,
    invited_by_profile_id,
    last_sent_at
  )
  values (
    v_tenant.id,
    v_admin_email,
    v_admin_name,
    'tenant_admin',
    'pending',
    p_auth_user_id,
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'name', v_tenant.name,
      'status', v_tenant.status
    ),
    'school', case
      when v_school.id is null then null
      else jsonb_build_object('id', v_school.id, 'name', v_school.name)
    end
  );
end;
$$;

revoke all on function public.platform_finalize_tenant_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon;
grant execute on function public.platform_finalize_tenant_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.platform_finalize_tenant_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Atomically creates the tenant, optional school, invited tenant-admin profile, and invitation audit after the email provider accepts the invitation.';

create or replace function public.get_platform_tenant_onboarding_summary()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  tenant_status text,
  tenant_created_at timestamptz,
  first_tenant_admin_profile_id uuid,
  first_tenant_admin_name text,
  first_tenant_admin_email text,
  tenant_admin_status text,
  active_tenant_admin_count bigint,
  latest_invitation_status text,
  latest_invitation_at timestamptz,
  setup_readiness text,
  has_buses boolean,
  has_drivers boolean,
  has_routes boolean,
  has_students boolean,
  last_onboarding_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with first_tenant_admin as (
    select distinct on (p.tenant_id)
      p.tenant_id,
      p.id as profile_id,
      p.full_name,
      p.email,
      p.status::text as profile_status
    from public.profiles p
    where p.role = 'tenant_admin'
    order by p.tenant_id, p.created_at, p.id
  ), active_tenant_admins as (
    select p.tenant_id, count(*) as active_count
    from public.profiles p
    where p.role = 'tenant_admin'
      and p.status = 'active'
    group by p.tenant_id
  ), latest_invites as (
    select distinct on (i.tenant_id)
      i.tenant_id,
      i.status,
      i.created_at,
      i.updated_at,
      i.last_sent_at,
      i.cancelled_at
    from public.tenant_onboarding_invitations i
    where i.role = 'tenant_admin'
    order by i.tenant_id, i.created_at desc
  ), readiness as (
    select
      t.id as tenant_id,
      exists (
        select 1 from public.buses b
        where b.tenant_id = t.id and b.status = 'active'
      ) as has_buses,
      exists (
        select 1 from public.drivers d
        where d.tenant_id = t.id and d.status = 'active'
      ) as has_drivers,
      exists (
        select 1 from public.routes r
        where r.tenant_id = t.id and r.status = 'active'
      ) as has_routes,
      exists (
        select 1 from public.students s
        where s.tenant_id = t.id and s.status = 'active'
      ) as has_students,
      exists (
        select 1 from public.guardians g
        where g.tenant_id = t.id and g.status = 'active'
      ) as has_guardians
    from public.tenants t
  )
  select
    t.id,
    t.name,
    t.type,
    t.status,
    t.created_at,
    fta.profile_id,
    fta.full_name,
    fta.email,
    coalesce(fta.profile_status, 'missing'),
    coalesce(ata.active_count, 0),
    coalesce(li.status, 'none'),
    li.created_at,
    case
      when not (
        coalesce(r.has_buses, false)
        or coalesce(r.has_drivers, false)
        or coalesce(r.has_routes, false)
        or coalesce(r.has_students, false)
      ) then 'not_started'
      when coalesce(r.has_buses, false)
        and coalesce(r.has_drivers, false)
        and coalesce(r.has_routes, false)
        and coalesce(r.has_students, false) then 'ready'
      else 'in_progress'
    end,
    coalesce(r.has_buses, false),
    coalesce(r.has_drivers, false),
    coalesce(r.has_routes, false),
    coalesce(r.has_students, false),
    greatest(
      t.created_at,
      coalesce(li.updated_at, li.last_sent_at, li.cancelled_at, li.created_at, t.created_at)
    )
  from public.tenants t
  left join first_tenant_admin fta on fta.tenant_id = t.id
  left join active_tenant_admins ata on ata.tenant_id = t.id
  left join latest_invites li on li.tenant_id = t.id
  left join readiness r on r.tenant_id = t.id
  where public.is_platform_super_admin()
    and (
      fta.profile_id is not null
      or coalesce(r.has_buses, false)
      or coalesce(r.has_drivers, false)
      or coalesce(r.has_routes, false)
      or coalesce(r.has_students, false)
      or coalesce(r.has_guardians, false)
    )
  order by t.created_at desc;
$$;

revoke all on function public.get_platform_tenant_onboarding_summary() from public, anon;
grant execute on function public.get_platform_tenant_onboarding_summary() to authenticated;

comment on function public.get_platform_tenant_onboarding_summary() is
  'Platform onboarding summary that suppresses empty orphan tenant attempts while retaining provisioned or operational tenants.';
