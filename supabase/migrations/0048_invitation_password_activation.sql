-- Require invited users to create a password before their SafeBus profile
-- becomes active, and expose only the first tenant-admin account identifier to
-- the platform onboarding control plane.

create or replace function public.complete_invited_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_password_hash text;
begin
  if auth.uid() is null then
    raise exception 'Sign in through a valid invitation before completing account setup.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'The invited SafeBus profile was not found.';
  end if;

  if v_profile.status = 'active' then
    return jsonb_build_object(
      'profileId', v_profile.id,
      'role', v_profile.role,
      'status', v_profile.status
    );
  end if;

  if v_profile.status <> 'invited' then
    raise exception 'This SafeBus account is not available for invitation setup.';
  end if;

  if v_profile.role <> 'platform_super_admin' and not exists (
    select 1
    from public.tenants t
    where t.id = v_profile.tenant_id
      and t.status = 'active'
  ) then
    raise exception 'This SafeBus organization is not active.';
  end if;

  select u.encrypted_password
  into v_password_hash
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if nullif(v_password_hash, '') is null then
    raise exception 'Create a password before completing account setup.';
  end if;

  update public.profiles
  set status = 'active'
  where id = auth.uid()
    and status = 'invited';

  update public.tenant_onboarding_invitations
  set status = 'activated',
      cancelled_at = null
  where invited_profile_id = auth.uid()
    and status in ('pending', 'resent');

  return jsonb_build_object(
    'profileId', v_profile.id,
    'role', v_profile.role,
    'status', 'active'
  );
end;
$$;

revoke all on function public.complete_invited_account() from public, anon;
grant execute on function public.complete_invited_account() to authenticated;

comment on function public.complete_invited_account() is
  'Activates only the authenticated invited profile after Supabase Auth contains a confirmed email and password. No caller can activate another profile.';

drop function if exists public.get_platform_tenant_onboarding_summary();

create function public.get_platform_tenant_onboarding_summary()
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
      ) as has_students
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
  order by t.created_at desc;
$$;

revoke all on function public.get_platform_tenant_onboarding_summary() from public, anon;
grant execute on function public.get_platform_tenant_onboarding_summary() to authenticated;

comment on function public.get_platform_tenant_onboarding_summary() is
  'Platform-safe onboarding summary including the first tenant-admin account lifecycle identifier; excludes tenant operational person and transportation data.';
