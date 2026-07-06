-- SafeBus Alberta - align route/route-stop write policies with optional school
--
-- Corrective migration for Milestone 4E Codex review blockers.
--
-- Background:
--   Migration 0011 made public.routes.school_id nullable so a tenant admin can
--   create a route without selecting a school. However, the existing route and
--   route-stop write policies (from 0005) still call public.can_write_school(),
--   which requires a concrete, matching schools row. With school_id = NULL,
--   can_write_school returns false, so hosted Supabase rejects the insert/
--   update under RLS — directly contradicting the 4E requirement that tenant
--   admins can create routes (and route stops on those routes) without a school.
--
-- Fix:
--   1. Replace the route insert/update policies so they call
--      public.can_write_optional_school(tenant_id, school_id) instead of
--      can_write_school. can_write_optional_school already exists (0005) and
--      handles NULL school correctly: when school_id is NULL it delegates to
--      can_write_tenant(tenant_id), which accepts platform_super_admin,
--      tenant_admin, and transportation_admin with a matching tenant. A
--      school_admin cannot write a school-less route (NULL != their school),
--      which is the intended domain behavior — school_admin is school-scoped.
--   2. CREATE OR REPLACE can_write_route_stop() to use can_write_optional_school
--      for the route's school_id, so route stops can be created/updated on
--      school-less routes by tenant-scoped admins.
--   3. CREATE OR REPLACE can_write_student_route_assignment() to use
--      can_write_optional_school for the route's school_id (the student's own
--      school_id is still required via can_write_school, since students always
--      belong to a school).
--
-- Security:
--   - Tenant isolation is preserved: every path still requires
--     tenant_id = current_tenant_id() (via can_write_tenant / can_write_school /
--     can_write_optional_school).
--   - No public/anon access is added.
--   - No grants are changed (the existing insert/update grants from 0005 still
--     apply).
--   - No RLS is weakened: a NULL-school route is only writable by roles that
--     can write the tenant, not by school_admin and not by drivers/guardians.
--   - No tables, columns, or FKs are changed. No data is touched.

-- ---------------------------------------------------------------------------
-- 1. Route insert/update policies: use can_write_optional_school.
-- ---------------------------------------------------------------------------
drop policy if exists "routes insert admin" on public.routes;
drop policy if exists "routes update admin" on public.routes;

create policy "routes insert admin"
  on public.routes for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  );

create policy "routes update admin"
  on public.routes for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  );

-- ---------------------------------------------------------------------------
-- 2. can_write_route_stop: use can_write_optional_school for the route's school.
--    This allows route stops on school-less routes (school_id = NULL) for
--    tenant-scoped admins. Tenant matching on routes.tenant_id is preserved.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_route_stop(p_tenant_id uuid, p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.routes r
    where r.id = p_route_id
      and r.tenant_id = p_tenant_id
      and public.can_write_optional_school(r.tenant_id, r.school_id)
  );
$$;

comment on function public.can_write_route_stop(uuid, uuid) is
  'Returns true if the caller can write route stops for the given route. Uses '
  'can_write_optional_school so school-less routes (school_id NULL) are '
  'allowed for tenant-scoped admins (platform_super_admin, tenant_admin, '
  'transportation_admin). school_admin can only write stops for routes '
  'belonging to their school. Tenant isolation preserved via r.tenant_id.';

-- ---------------------------------------------------------------------------
-- 3. can_write_student_route_assignment: use can_write_optional_school for the
--    route's school (students always belong to a school, so the student side
--    keeps can_write_school). This allows students to be assigned to
--    school-less routes.
-- ---------------------------------------------------------------------------
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
      and public.can_write_school(s.tenant_id, s.school_id)
      and public.can_write_optional_school(r.tenant_id, r.school_id)
      and (
        p_pickup_stop_id is null
        or exists (
          select 1
          from public.route_stops ps
          where ps.id = p_pickup_stop_id
            and ps.tenant_id = p_tenant_id
            and ps.route_id = p_route_id
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
        )
      )
  );
$$;

comment on function public.can_write_student_route_assignment(
  uuid, uuid, uuid, uuid, uuid
) is
  'Returns true if the caller can write a student route assignment. The '
  'student side requires can_write_school (students always belong to a '
  'school). The route side uses can_write_optional_school so school-less '
  'routes are allowed for tenant-scoped admins. Tenant isolation preserved.';
