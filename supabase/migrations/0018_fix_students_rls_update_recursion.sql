-- SafeBus Alberta - fix students RLS UPDATE recursion
--
-- Production RLS bug fix for Milestone 5A.2 manual SQL testing.
--
-- Root cause:
--   UPDATE public.students also has to evaluate row visibility for the target
--   rows. The existing permissive SELECT policy "students select linked guardian"
--   queried public.student_guardians directly. public.student_guardians has its
--   own SELECT policy for school admins that queries public.students. That
--   students -> student_guardians -> students policy cycle can be entered while
--   planning/evaluating UPDATE public.students, producing PostgreSQL error
--   42P17: infinite recursion detected in policy for relation "students".
--
-- Fix:
--   Move guardian-linked student visibility into a SECURITY DEFINER helper that
--   checks the caller's role, tenant, active guardian id, and active link without
--   invoking student_guardians RLS. The helper does not query public.students,
--   so students policies no longer re-enter students RLS.
--
-- This migration does not alter student write policies, does not add DELETE,
-- does not disable RLS, and does not change guardian visibility semantics.

create or replace function public.can_select_linked_student_as_guardian(
  p_student_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role() = 'guardian'
    and p_tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.student_guardians sg
      where sg.student_id = p_student_id
        and sg.tenant_id = p_tenant_id
        and sg.guardian_id = public.current_guardian_id()
        and sg.status = 'active'
    ),
    false
  );
$$;

comment on function public.can_select_linked_student_as_guardian(uuid, uuid) is
  'Non-recursive guardian visibility helper for public.students RLS. Checks the active caller guardian link in the same tenant without querying public.students.';

-- Replace the recursive students SELECT policy with the non-recursive helper.
drop policy if exists "students select linked guardian" on public.students;

create policy "students select linked guardian"
  on public.students for select to authenticated
  using (
    public.can_select_linked_student_as_guardian(id, tenant_id)
  );
