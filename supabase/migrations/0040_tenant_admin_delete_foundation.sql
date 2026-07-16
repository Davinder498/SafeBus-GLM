-- SafeBus Alberta - tenant admin delete foundation
--
-- Adds DELETE RLS policies so tenant admins (and platform super admins) can
-- hard-delete routes, students, buses, drivers, and guardians within their
-- own tenant.
--
-- Design notes:
--   * DELETE is restricted to tenant_admin and platform_super_admin only.
--     school_admin and transportation_admin retain their existing write
--     (insert/update) privileges but cannot delete records.
--   * All policies check tenant_id = current_tenant_id() so a tenant admin
--     can never delete cross-tenant rows.
--   * Existing ON DELETE CASCADE foreign keys remove child rows such as route
--     stops, student route assignments, and student-guardian links. Migration
--     0041 aligns the newer route-assignment foreign keys with this behavior.

-- Helper: is the caller a tenant-level delete admin?
create or replace function public.is_tenant_delete_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    public.current_user_role() in (
      'platform_super_admin',
      'tenant_admin'
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- DELETE policies
-- ---------------------------------------------------------------------------
drop policy if exists "buses delete tenant admin" on public.buses;
create policy "buses delete tenant admin"
  on public.buses for delete to authenticated
  using (
    public.is_tenant_delete_admin()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "drivers delete tenant admin" on public.drivers;
create policy "drivers delete tenant admin"
  on public.drivers for delete to authenticated
  using (
    public.is_tenant_delete_admin()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "routes delete tenant admin" on public.routes;
create policy "routes delete tenant admin"
  on public.routes for delete to authenticated
  using (
    public.is_tenant_delete_admin()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "students delete tenant admin" on public.students;
create policy "students delete tenant admin"
  on public.students for delete to authenticated
  using (
    public.is_tenant_delete_admin()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "guardians delete tenant admin" on public.guardians;
create policy "guardians delete tenant admin"
  on public.guardians for delete to authenticated
  using (
    public.is_tenant_delete_admin()
    and tenant_id = public.current_tenant_id()
  );

-- Grant DELETE to authenticated so the RLS policies can take effect.
grant delete on table public.buses to authenticated;
grant delete on table public.drivers to authenticated;
grant delete on table public.routes to authenticated;
grant delete on table public.students to authenticated;
grant delete on table public.guardians to authenticated;
