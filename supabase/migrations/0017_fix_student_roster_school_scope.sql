-- SafeBus Alberta - fix student roster school scope
--
-- Corrective migration for Milestone 5A.1 Codex review blocker.
--
-- Problem:
--   Migration 0016 added INSERT/UPDATE policies on public.students that only
--   checked is_transportation_write_admin() + tenant_id = current_tenant_id().
--   This did NOT validate that school_id (when present) belongs to the same
--   tenant. A malicious client could insert/update:
--     tenant_id = current_tenant_id()
--     school_id = <uuid of school in another tenant>
--   The FK only proves the school exists, not that it belongs to the same
--   tenant.
--
-- Additionally, can_write_optional_school() delegates NULL school to
-- can_write_tenant(), which allows school_admin to write NULL-school students
-- (because can_write_tenant includes school_admin). For student roster writes,
-- school_admin should only manage students at their own school, not
-- tenant-wide NULL-school students.
--
-- Fix:
--   1. Create a student-specific helper: public.can_write_student_roster()
--      - tenant_admin / transportation_admin: may write students with school_id
--        NULL or a school in their tenant (validated).
--      - platform_super_admin: may write students with school_id NULL or a
--        school in the given tenant (validated).
--      - school_admin: may only write students where school_id =
--        current_school_id() (NOT NULL). school_admin cannot manage
--        NULL-school students.
--      - All other roles (driver, guardian, anon): denied.
--   2. Drop the old policies from 0016 and recreate them using
--      can_write_student_roster.
--
-- No tables are altered. No data is deleted. No DELETE policy is added.

create or replace function public.can_write_student_roster(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- platform_super_admin: may write any tenant's students. school_id must
    -- belong to the given tenant when present.
    (
      public.is_platform_super_admin()
      and (
        p_school_id is null
        or exists (
          select 1 from public.schools s
          where s.id = p_school_id and s.tenant_id = p_tenant_id
        )
      )
    )
    -- tenant_admin and transportation_admin: may write students in their own
    -- tenant. school_id must be NULL or a school in their tenant.
    or (
      public.current_user_role() in ('tenant_admin', 'transportation_admin')
      and p_tenant_id = public.current_tenant_id()
      and (
        p_school_id is null
        or exists (
          select 1 from public.schools s
          where s.id = p_school_id and s.tenant_id = p_tenant_id
        )
      )
    )
    -- school_admin: may only write students at their own school. school_id
    -- must be non-null and equal to current_school_id(). school_admin CANNOT
    -- manage NULL-school (tenant-wide) students.
    or (
      public.current_user_role() = 'school_admin'
      and p_tenant_id = public.current_tenant_id()
      and p_school_id is not null
      and p_school_id = public.current_school_id()
    );
$$;

comment on function public.can_write_student_roster(uuid, uuid) is
  'Student-roster-specific write authorization. tenant_admin and '
  'transportation_admin may write students with NULL or same-tenant school_id. '
  'school_admin may only write students at their own school (non-NULL). '
  'platform_super_admin may write any tenant''s students with validated school. '
  'All other roles are denied. Prevents cross-tenant school references.';

-- Drop old policies from 0016.
drop policy if exists "students insert admin" on public.students;
drop policy if exists "students update admin" on public.students;

-- Recreate with school-scope validation.
create policy "students insert admin"
  on public.students for insert to authenticated
  with check (
    public.can_write_student_roster(tenant_id, school_id)
  );

create policy "students update admin"
  on public.students for update to authenticated
  using (
    public.can_write_student_roster(tenant_id, school_id)
  )
  with check (
    public.can_write_student_roster(tenant_id, school_id)
  );

-- No DELETE policy. Students are deactivated, not deleted.
