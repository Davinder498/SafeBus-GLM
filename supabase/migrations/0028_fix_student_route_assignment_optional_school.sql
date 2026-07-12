-- SafeBus Alberta - fix student route assignment writes for school-less students
--
-- Migration 0012 correctly allowed school-less routes, but the assignment
-- authorization helper still called can_write_school() for students. Students
-- are allowed to have school_id = NULL, so tenant_admin and
-- transportation_admin assignment inserts were incorrectly rejected by RLS.
--
-- This forward-only correction uses can_write_optional_school() for both the
-- student and route. Tenant isolation remains mandatory. school_admin remains
-- school-scoped because can_write_optional_school() does not allow a
-- school_admin to write a NULL-school or different-school record.

create or replace function public.can_write_student_route_assignment(
  p_tenant_id uuid,
  p_student_id uuid,
  p_route_id uuid,
  p_pickup_stop_id uuid,
  p_dropoff_stop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.routes r on r.id = p_route_id
    where s.id = p_student_id
      and s.tenant_id = p_tenant_id
      and r.tenant_id = p_tenant_id
      and public.can_write_optional_school(s.tenant_id, s.school_id)
      and public.can_write_optional_school(r.tenant_id, r.school_id)
      and (
        p_pickup_stop_id is null
        or exists (
          select 1
          from public.route_stops ps
          where ps.id = p_pickup_stop_id
            and ps.tenant_id = p_tenant_id
            and ps.route_id = p_route_id
            and ps.status = 'active'
        )
      )
      and (
        p_dropoff_stop_id is null
        or exists (
          select 1
          from public.route_stops ds
          where ds.id = p_dropoff_stop_id
            and ds.tenant_id = p_tenant_id
            and ds.route_id = p_route_id
            and ds.status = 'active'
        )
      )
  );
$$;

comment on function public.can_write_student_route_assignment(
  uuid, uuid, uuid, uuid, uuid
) is
  'Authorizes student route assignment writes within the caller tenant. '
  'School-less students and routes are allowed only for tenant-scoped admins; '
  'school admins remain school-scoped. Pickup/drop-off stops must be active '
  'and belong to the selected route and tenant.';
