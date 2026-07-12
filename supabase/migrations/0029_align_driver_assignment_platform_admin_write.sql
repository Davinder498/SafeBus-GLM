-- SafeBus Alberta - align driver assignment writes for platform admins
--
-- Migration 0013 allowed platform_super_admin users to read assignments and
-- classified them as transportation write admins, but its INSERT/UPDATE
-- policies also required tenant_id = current_tenant_id(). Platform admins may
-- legitimately have no tenant on their own profile, so that extra comparison
-- rejected assignments for otherwise-valid tenant routes, buses, and drivers.
--
-- Reuse can_write_tenant(), as the other transportation write policies do:
-- platform admins may target a tenant explicitly, while tenant-scoped admins
-- remain restricted to their own tenant. Entity validation and RLS stay in
-- place; no public or cross-tenant policy is introduced.

drop policy if exists "driver_route_assignments insert admin"
  on public.driver_route_assignments;

create policy "driver_route_assignments insert admin"
  on public.driver_route_assignments for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_tenant(tenant_id)
    and public.driver_assignment_entities_in_tenant(
      tenant_id,
      driver_id,
      bus_id,
      route_id
    )
  );

drop policy if exists "driver_route_assignments update admin"
  on public.driver_route_assignments;

create policy "driver_route_assignments update admin"
  on public.driver_route_assignments for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_tenant(tenant_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_tenant(tenant_id)
    and public.driver_assignment_entities_in_tenant(
      tenant_id,
      driver_id,
      bus_id,
      route_id
    )
  );


