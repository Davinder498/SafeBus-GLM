-- SafeBus Alberta - student and guardian foundation
--
-- Privacy-first child record foundation for Milestone 3B.
-- This migration intentionally excludes future transportation operations
-- tables and restricted student identifiers.

create table public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  grade text,
  school_student_number text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_status_check check (
    status in ('active', 'inactive', 'transferred', 'archived')
  )
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardians_status_check check (
    status in ('active', 'inactive', 'suspended', 'archived')
  ),
  constraint guardians_profile_tenant_unique unique (profile_id, tenant_id)
);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text not null default 'guardian',
  can_receive_notifications boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_guardians_relationship_check check (
    relationship in ('mother', 'father', 'guardian', 'caregiver', 'other')
  ),
  constraint student_guardians_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint student_guardians_student_guardian_unique unique (student_id, guardian_id)
);

create index students_tenant_id_idx on public.students(tenant_id);
create index students_school_id_idx on public.students(school_id);
create index students_status_idx on public.students(status);
create index guardians_tenant_id_idx on public.guardians(tenant_id);
create index guardians_profile_id_idx on public.guardians(profile_id);
create index student_guardians_tenant_id_idx on public.student_guardians(tenant_id);
create index student_guardians_student_id_idx on public.student_guardians(student_id);
create index student_guardians_guardian_id_idx on public.student_guardians(guardian_id);

create trigger set_updated_at_students
  before update on public.students
  for each row execute function public.set_updated_at();

create trigger set_updated_at_guardians
  before update on public.guardians
  for each row execute function public.set_updated_at();

create trigger set_updated_at_student_guardians
  before update on public.student_guardians
  for each row execute function public.set_updated_at();

create or replace function public.current_guardian_id()
returns uuid
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

alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;

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

grant select on table public.students to authenticated;
grant select on table public.guardians to authenticated;
grant select on table public.student_guardians to authenticated;
