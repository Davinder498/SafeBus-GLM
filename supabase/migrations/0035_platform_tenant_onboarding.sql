-- Phase 12.5 platform and tenant-controlled onboarding foundation.

create table if not exists public.tenant_onboarding_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null,
  status text not null default 'pending',
  invited_profile_id uuid references public.profiles(id) on delete set null,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  last_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_onboarding_role_check check (role in ('tenant_admin','driver','guardian')),
  constraint tenant_onboarding_status_check check (status in ('pending','resent','activated','cancelled','failed'))
);

create index if not exists tenant_onboarding_invitations_tenant_idx on public.tenant_onboarding_invitations(tenant_id);
create index if not exists tenant_onboarding_invitations_profile_idx on public.tenant_onboarding_invitations(invited_profile_id);
create index if not exists tenant_onboarding_invitations_email_idx on public.tenant_onboarding_invitations(lower(email));

create trigger set_updated_at_tenant_onboarding_invitations
  before update on public.tenant_onboarding_invitations
  for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
    and p.status = 'active'
    and (p.role = 'platform_super_admin' or t.status = 'active')
  limit 1;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

alter table public.tenant_onboarding_invitations enable row level security;

create policy "tenant onboarding select platform admin"
  on public.tenant_onboarding_invitations for select to authenticated
  using (public.is_platform_super_admin());

create policy "tenant onboarding select tenant admin"
  on public.tenant_onboarding_invitations for select to authenticated
  using (public.is_tenant_admin() and tenant_id = public.current_tenant_id());

grant select on table public.tenant_onboarding_invitations to authenticated;

create or replace function public.get_platform_tenant_onboarding_summary()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  tenant_status text,
  tenant_created_at timestamptz,
  tenant_admin_status text,
  latest_invitation_status text,
  buses_count bigint,
  drivers_count bigint,
  routes_count bigint,
  students_count bigint,
  guardians_count bigint,
  operationally_ready boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.type,
    t.status,
    t.created_at,
    case when exists (select 1 from public.profiles p where p.tenant_id = t.id and p.role = 'tenant_admin' and p.status = 'active') then 'activated'
         when exists (select 1 from public.profiles p where p.tenant_id = t.id and p.role = 'tenant_admin' and p.status = 'invited') then 'invited'
         else 'missing' end,
    coalesce((select i.status from public.tenant_onboarding_invitations i where i.tenant_id = t.id and i.role = 'tenant_admin' order by i.created_at desc limit 1), 'none'),
    (select count(*) from public.buses b where b.tenant_id = t.id and b.status = 'active'),
    (select count(*) from public.drivers d where d.tenant_id = t.id and d.status = 'active'),
    (select count(*) from public.routes r where r.tenant_id = t.id and r.status = 'active'),
    (select count(*) from public.students s where s.tenant_id = t.id and s.status = 'active'),
    (select count(*) from public.guardians g where g.tenant_id = t.id and g.status = 'active'),
    exists (select 1 from public.buses b where b.tenant_id = t.id and b.status = 'active')
    and exists (select 1 from public.drivers d where d.tenant_id = t.id and d.status = 'active')
    and exists (select 1 from public.routes r where r.tenant_id = t.id and r.status = 'active')
    and exists (select 1 from public.students s where s.tenant_id = t.id and s.status = 'active')
    and exists (select 1 from public.guardians g where g.tenant_id = t.id and g.status = 'active')
  from public.tenants t
  where public.is_platform_super_admin()
  order by t.created_at desc;
$$;

revoke all on function public.get_platform_tenant_onboarding_summary() from public, anon;
grant execute on function public.get_platform_tenant_onboarding_summary() to authenticated;
