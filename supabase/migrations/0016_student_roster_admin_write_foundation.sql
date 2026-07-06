-- SafeBus Alberta - tenant admin student roster foundation
--
-- Milestone 5A.1: tenant admin student roster management (create, edit,
-- deactivate/reactivate). This migration is additive only:
--
--   1. Drops NOT NULL on public.students.school_id so a student can be created
--      without a school (consistent with 4E's school-optional domain model).
--   2. Adds INSERT/UPDATE RLS policies on public.students for transportation
--      write admins (same pattern as 0005/0012).
--   3. Grants INSERT/UPDATE on public.students to authenticated.
--
-- No tables are created, altered (beyond the constraint drop), or dropped.
-- No existing RLS SELECT policies are changed. No data is deleted.

-- ---------------------------------------------------------------------------
-- Make students.school_id nullable (consistent with 4E domain model)
-- ---------------------------------------------------------------------------
alter table public.students alter column school_id drop not null;

comment on column public.students.school_id is
  'Optional school this student is enrolled at. Nullable as of Milestone 5A.1: '
  'a tenant admin can create a student without selecting a school. When '
  'present, must reference an existing schools(id) row in the same tenant.';

-- ---------------------------------------------------------------------------
-- INSERT/UPDATE RLS policies on students (for admin roster management)
--
-- Migration 0003 created the table with SELECT-only policies. Admins need to
-- create and edit students. These policies follow the same pattern as 0005
-- (transportation admin write foundation) and 0012 (optional school):
-- transportation write admins can insert/update students in their tenant.
-- school_id is optional (can_write_optional_school).
-- ---------------------------------------------------------------------------
create policy "students insert admin"
  on public.students for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "students update admin"
  on public.students for update to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  );

-- No DELETE policy: students are deactivated, not deleted, to preserve
-- audit history and guardian links.

grant insert, update on table public.students to authenticated;
