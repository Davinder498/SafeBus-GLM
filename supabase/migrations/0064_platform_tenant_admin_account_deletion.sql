-- Keep an onboarded tenant visible after its tenant-admin Auth account and
-- cascading profile row are permanently deleted. The retained invitation is
-- the audit signal that distinguishes an intentionally onboarded tenant from
-- an empty orphan created by an older failed workflow.

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
      or li.tenant_id is not null
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
  'Platform onboarding summary that retains tenants with onboarding invitation history after their tenant-admin account is deleted.';
