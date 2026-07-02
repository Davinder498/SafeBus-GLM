-- SafeBus Alberta - legacy hosted schema alignment
--
-- LEGACY ONLY.
--
-- This migration was created only to make the old hosted prototype database
-- temporarily compatible with the current web app. It adapts around legacy
-- text IDs, old columns, permissive prototype policies, and extra prototype
-- tables that are not part of the clean SafeBus foundation.
--
-- Do not apply this file to clean development, staging, or production
-- databases. The active source of truth is supabase/migrations/0001-0003.

begin;

-- App-required columns that are missing from the hosted prototype schema.
alter table public.tenants
  add column if not exists type text not null default 'school',
  add column if not exists updated_at timestamptz not null default now();

alter table public.schools
  add column if not exists province text not null default 'AB',
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.students
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists preferred_name text,
  add column if not exists school_student_number text,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

update public.students
set
  first_name = coalesce(nullif(first_name, ''), split_part(name, ' ', 1)),
  last_name = coalesce(
    nullif(last_name, ''),
    nullif(trim(regexp_replace(name, '^\S+\s*', '')), ''),
    name
  )
where name is not null
  and (first_name is null or first_name = '' or last_name is null or last_name = '');

alter table public.students
  alter column first_name set not null,
  alter column last_name set not null;

alter table public.guardians
  add column if not exists full_name text,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

update public.guardians
set full_name = coalesce(nullif(full_name, ''), name)
where name is not null
  and (full_name is null or full_name = '');

alter table public.guardians
  alter column full_name set not null;

alter table public.student_guardians
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

-- Shared updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_tenants on public.tenants;
create trigger set_updated_at_tenants
  before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_schools on public.schools;
create trigger set_updated_at_schools
  before update on public.schools
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_students on public.students;
create trigger set_updated_at_students
  before update on public.students
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_guardians on public.guardians;
create trigger set_updated_at_guardians
  before update on public.guardians
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_student_guardians on public.student_guardians;
create trigger set_updated_at_student_guardians
  before update on public.student_guardians
  for each row execute function public.set_updated_at();

-- Role/context helpers adapted to the hosted prototype's text tenant/school IDs.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.current_user_role()
returns text
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
returns text
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
returns text
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

create or replace function public.current_guardian_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.guardians
  where profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and status = 'active'
  limit 1;
$$;

alter table public.tenants enable row level security;
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;

-- Remove permissive prototype policies and replace them with read policies.
drop policy if exists tenant_isolation_policy on public.tenants;
drop policy if exists school_tenant_isolation_policy on public.schools;
drop policy if exists profiles_tenant_isolation_policy on public.profiles;
drop policy if exists students_tenant_isolation_policy on public.students;
drop policy if exists guardians_tenant_isolation_policy on public.guardians;
drop policy if exists student_guardians_tenant_isolation_policy on public.student_guardians;

drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles select platform admin" on public.profiles;
drop policy if exists "profiles select tenant admin" on public.profiles;
drop policy if exists "profiles select school or transportation admin" on public.profiles;

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

drop policy if exists "tenants select platform admin" on public.tenants;
drop policy if exists "tenants select own tenant" on public.tenants;

create policy "tenants select platform admin"
  on public.tenants for select to authenticated
  using (public.is_platform_super_admin());

create policy "tenants select own tenant"
  on public.tenants for select to authenticated
  using (id = public.current_tenant_id());

drop policy if exists "schools select platform admin" on public.schools;
drop policy if exists "schools select tenant admin" on public.schools;
drop policy if exists "schools select school or transportation admin" on public.schools;
drop policy if exists "schools select linked school" on public.schools;

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

drop policy if exists "students select platform admin" on public.students;
drop policy if exists "students select tenant admin" on public.students;
drop policy if exists "students select school or transportation admin" on public.students;
drop policy if exists "students select linked guardian" on public.students;

create policy "students select platform admin"
  on public.students for select to authenticated
  using (public.is_platform_super_admin());

create policy "students select tenant admin"
  on public.students for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "students select school or transportation admin"
  on public.students for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or school_id = public.current_school_id()
    )
  );

create policy "students select linked guardian"
  on public.students for select to authenticated
  using (
    public.current_user_role() = 'guardian'
    and exists (
      select 1
      from public.student_guardians sg
      where sg.student_id = students.id
        and sg.guardian_id = public.current_guardian_id()
        and sg.status = 'active'
    )
  );

drop policy if exists "guardians select platform admin" on public.guardians;
drop policy if exists "guardians select tenant admin" on public.guardians;
drop policy if exists "guardians select school or transportation admin" on public.guardians;
drop policy if exists "guardians select own" on public.guardians;

create policy "guardians select platform admin"
  on public.guardians for select to authenticated
  using (public.is_platform_super_admin());

create policy "guardians select tenant admin"
  on public.guardians for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "guardians select school or transportation admin"
  on public.guardians for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.student_guardians sg
        join public.students s on s.id = sg.student_id
        where sg.guardian_id = guardians.id
          and sg.status = 'active'
          and s.school_id = public.current_school_id()
      )
    )
  );

create policy "guardians select own"
  on public.guardians for select to authenticated
  using (
    public.current_user_role() = 'guardian'
    and profile_id = auth.uid()
  );

drop policy if exists "student guardians select platform admin" on public.student_guardians;
drop policy if exists "student guardians select tenant admin" on public.student_guardians;
drop policy if exists "student guardians select school or transportation admin" on public.student_guardians;
drop policy if exists "student guardians select own guardian links" on public.student_guardians;

create policy "student guardians select platform admin"
  on public.student_guardians for select to authenticated
  using (public.is_platform_super_admin());

create policy "student guardians select tenant admin"
  on public.student_guardians for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "student guardians select school or transportation admin"
  on public.student_guardians for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.students s
        where s.id = student_guardians.student_id
          and s.school_id = public.current_school_id()
      )
    )
  );

create policy "student guardians select own guardian links"
  on public.student_guardians for select to authenticated
  using (
    public.current_user_role() = 'guardian'
    and guardian_id = public.current_guardian_id()
  );

-- Browser roles should not have broad write privileges on foundation tables.
grant usage on schema public to authenticated;

revoke all privileges on table
  public.tenants,
  public.schools,
  public.profiles,
  public.students,
  public.guardians,
  public.student_guardians
from anon, authenticated;

grant select on table
  public.tenants,
  public.schools,
  public.profiles,
  public.students,
  public.guardians,
  public.student_guardians
to authenticated;

notify pgrst, 'reload schema';

commit;
