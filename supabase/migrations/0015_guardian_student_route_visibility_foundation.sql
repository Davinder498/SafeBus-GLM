-- SafeBus Alberta - guardian student route visibility foundation
--
-- Milestone 5A: guardian-facing student and route visibility.
--
-- This migration is additive only:
--   1. Adds INSERT/UPDATE RLS policies on public.student_guardians so tenant
--      admins can create and deactivate guardian-student links.
--   2. Grants INSERT/UPDATE on public.student_guardians to authenticated.
--   3. Creates public.get_guardian_student_route_visibility() RPC — the secure
--      read path that returns only the caller's linked students and their route
--      assignment summaries.
--
-- No tables are created, altered, or dropped. No existing RLS policies are
-- changed. No data is deleted. No live location data is exposed.

-- ---------------------------------------------------------------------------
-- INSERT/UPDATE policies on student_guardians (for admin link management)
--
-- Migration 0003 created the table with SELECT-only policies. Admins need to
-- create and deactivate links. These policies follow the same pattern as 0005
-- (transportation admin write foundation): transportation write admins can
-- insert/update links in their tenant.
-- ---------------------------------------------------------------------------
create policy "student guardians insert admin"
  on public.student_guardians for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "student guardians update admin"
  on public.student_guardians for update to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  );

grant insert, update on table public.student_guardians to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_guardian_student_route_visibility
--
-- Returns only the caller's linked students and their active route assignment
-- summaries (route name, pickup/dropoff stop names). SECURITY DEFINER with
-- set search_path = public.
--
-- SECURITY NOTE: This function is SECURITY DEFINER and bypasses table-level
-- RLS. The REAL security guarantee is the function's own explicit checks:
--   1. auth.uid() is not null
--   2. current_user_role() = 'guardian'
--   3. only students linked to current_guardian_id() with active status are
--      returned
--   4. only the caller's tenant is visible (via current_tenant_id())
-- No live location, no bus data, no trip data, no other students.
-- ---------------------------------------------------------------------------
create or replace function public.get_guardian_student_route_visibility()
returns table (
  student_id uuid,
  student_first_name text,
  student_last_name text,
  student_preferred_name text,
  student_grade text,
  route_assignment_id uuid,
  route_id uuid,
  route_name text,
  pickup_stop_name text,
  dropoff_stop_name text,
  assignment_status text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as student_id,
    s.first_name as student_first_name,
    s.last_name as student_last_name,
    s.preferred_name as student_preferred_name,
    s.grade as student_grade,
    sra.id as route_assignment_id,
    r.id as route_id,
    r.route_name as route_name,
    ps.stop_name as pickup_stop_name,
    ds.stop_name as dropoff_stop_name,
    sra.status as assignment_status
  from public.students s
  join public.student_guardians sg
    on sg.student_id = s.id
    and sg.guardian_id = public.current_guardian_id()
    and sg.status = 'active'
  left join public.student_route_assignments sra
    on sra.student_id = s.id
    and sra.status = 'active'
  left join public.routes r
    on r.id = sra.route_id
  left join public.route_stops ps
    on ps.id = sra.pickup_stop_id
  left join public.route_stops ds
    on ds.id = sra.dropoff_stop_id
  where s.status = 'active'
    and s.tenant_id = public.current_tenant_id()
    and auth.uid() is not null
    and public.current_user_role() = 'guardian'
  order by s.last_name, s.first_name;
$$;

comment on function public.get_guardian_student_route_visibility() is
  'Guardian-scoped read of linked students and their active route assignments. '
  'Returns only students linked to the caller via active student_guardians rows '
  'in the caller''s tenant. LEFT JOINs route assignments so students without '
  'assignments still appear. Does not expose live location, bus data, trip ids, '
  'or other students. SECURITY DEFINER; internal role/guardian/tenant checks '
  'are the primary enforcement.';

revoke all on function public.get_guardian_student_route_visibility() from public;
revoke all on function public.get_guardian_student_route_visibility() from anon;
grant execute on function public.get_guardian_student_route_visibility() to authenticated;
