-- SafeBus Alberta - fix Phase 8 guardian/student RLS recursion
--
-- Migration 0087 made guardian access expiry-aware by replacing the
-- "students select linked guardian" policy with a direct lookup against
-- public.student_guardians. That reintroduced the policy cycle previously
-- removed by migration 0018:
--
--   students -> student_guardians -> students
--
-- PostgreSQL rejects student updates while that cycle exists with SQLSTATE
-- 42P17 (infinite recursion detected in policy for relation "students").
-- Keep the Phase 8 expiry semantics, but evaluate the link through a
-- SECURITY DEFINER helper that does not invoke student_guardians RLS.

create or replace function public.can_select_linked_student_as_guardian(
  p_student_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() is not null
    and public.current_user_role() = 'guardian'
    and p_tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.student_guardians sg
      where sg.student_id = p_student_id
        and sg.tenant_id = p_tenant_id
        and sg.guardian_id = public.current_guardian_id()
        and sg.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    ),
    false
  );
$$;

revoke all on function public.can_select_linked_student_as_guardian(uuid, uuid)
  from public, anon;
grant execute on function public.can_select_linked_student_as_guardian(uuid, uuid)
  to authenticated;

comment on function public.can_select_linked_student_as_guardian(uuid, uuid) is
  'Non-recursive, expiry-aware guardian visibility helper for public.students RLS. Checks only the authenticated caller''s active same-tenant guardian link.';

drop policy if exists "students select linked guardian" on public.students;

create policy "students select linked guardian"
  on public.students for select to authenticated
  using (
    public.can_select_linked_student_as_guardian(id, tenant_id)
  );
