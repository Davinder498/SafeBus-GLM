-- SafeBus Alberta - restore school-scoped student roster writes
--
-- Migration 0036 intentionally removed platform-super-admin access to tenant
-- operational data, but it also replaced can_write_student_roster() with the
-- generic can_write_optional_school() helper. That generic helper permits a
-- school_admin to write tenant-wide records when school_id is NULL.
--
-- Student roster writes have a narrower boundary: tenant and transportation
-- administrators may manage school-assigned or unassigned students across
-- their tenant, while school administrators may manage only students assigned
-- to their own school. Platform administrators, drivers, guardians, and
-- anonymous users remain denied.

create or replace function public.can_write_student_roster(
  p_tenant_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      public.current_user_role() in ('tenant_admin', 'transportation_admin')
      and p_tenant_id = public.current_tenant_id()
      and (
        p_school_id is null
        or exists (
          select 1
          from public.schools s
          where s.id = p_school_id
            and s.tenant_id = p_tenant_id
        )
      )
    )
    or (
      public.current_user_role() = 'school_admin'
      and p_tenant_id = public.current_tenant_id()
      and p_school_id is not null
      and p_school_id = public.current_school_id()
    ),
    false
  );
$$;

comment on function public.can_write_student_roster(uuid, uuid) is
  'Authorizes tenant_admin and transportation_admin student writes across '
  'their tenant, including NULL school_id, and restricts school_admin writes '
  'to a non-NULL school_id matching their own school. All other roles denied.';
