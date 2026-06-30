-- SafeBus Alberta - clean auth/profile baseline
--
-- Pre-production migration reset for Milestone 2A/2B.
-- This baseline intentionally contains no transportation business tables.

create extension if not exists "pgcrypto";

create type public.user_role as enum (
  'platform_super_admin',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'driver',
  'guardian'
);

create type public.profile_status as enum (
  'invited',
  'active',
  'suspended',
  'disabled'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'school',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_type_check check (
    type in ('school', 'school_group', 'bus_contractor', 'demo')
  ),
  constraint tenants_status_check check (
    status in ('active', 'suspended', 'disabled')
  )
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  city text,
  province text not null default 'AB',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_status_check check (
    status in ('active', 'suspended', 'disabled')
  )
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  full_name text not null,
  email text not null,
  role public.user_role not null,
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_id_idx on public.profiles(tenant_id);
create index profiles_school_id_idx on public.profiles(school_id);
create index profiles_role_idx on public.profiles(role);
create index profiles_email_idx on public.profiles(email);
create index schools_tenant_id_idx on public.schools(tenant_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_tenants
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger set_updated_at_schools
  before update on public.schools
  for each row execute function public.set_updated_at();

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'platform_super_admin', false);
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'tenant_admin', false);
$$;

create or replace function public.is_school_or_transportation_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    public.current_user_role() in ('school_admin', 'transportation_admin'),
    false
  );
$$;

alter table public.tenants enable row level security;
alter table public.schools enable row level security;
alter table public.profiles enable row level security;

create policy "profiles select own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles select platform admin"
  on public.profiles for select to authenticated
  using (public.is_platform_super_admin());

create policy "profiles select tenant admin"
  on public.profiles for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "profiles select school or transportation admin"
  on public.profiles for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or school_id = public.current_school_id()
    )
  );

create policy "tenants select platform admin"
  on public.tenants for select to authenticated
  using (public.is_platform_super_admin());

create policy "tenants select own tenant"
  on public.tenants for select to authenticated
  using (id = public.current_tenant_id());

create policy "schools select platform admin"
  on public.schools for select to authenticated
  using (public.is_platform_super_admin());

create policy "schools select tenant admin"
  on public.schools for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "schools select school or transportation admin"
  on public.schools for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or id = public.current_school_id()
    )
  );

create policy "schools select linked school"
  on public.schools for select to authenticated
  using (
    id = public.current_school_id()
    and public.current_user_role() in ('driver', 'guardian')
  );
