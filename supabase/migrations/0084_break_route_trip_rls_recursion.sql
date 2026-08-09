-- SafeBus Alberta - break the routes <-> driver_trips RLS dependency cycle
--
-- The assigned-driver routes policy queried driver_trips, while the Phase 6
-- school-admin driver_trips policy queried routes. PostgreSQL may evaluate
-- every applicable policy expression even when a role predicate is false,
-- producing infinite recursion for non-driver callers. Keep the same driver
-- scope in a narrow SECURITY DEFINER predicate so its internal assignment and
-- active-trip lookups do not recursively invoke their table policies.

create or replace function public.driver_can_read_assigned_route(
  p_tenant_id uuid,
  p_route_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and public.current_user_role() = 'driver'
    and p_tenant_id = public.current_tenant_id()
    and p_route_id is not null
    and exists (
      select 1
      from public.drivers d
      where d.id = public.current_driver_id()
        and d.tenant_id = p_tenant_id
        and d.status = 'active'
    )
    and (
      exists (
        select 1
        from public.driver_route_assignments dra
        where dra.route_id = p_route_id
          and dra.tenant_id = p_tenant_id
          and dra.driver_id = public.current_driver_id()
          and dra.status = 'active'
          and (dra.effective_from is null or dra.effective_from <= current_date)
          and (dra.effective_to is null or dra.effective_to >= current_date)
      )
      or exists (
        select 1
        from public.driver_trips dt
        where dt.route_id = p_route_id
          and dt.tenant_id = p_tenant_id
          and dt.driver_id = public.current_driver_id()
          and dt.status = 'active'
      )
    );
$$;

revoke all on function public.driver_can_read_assigned_route(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.driver_can_read_assigned_route(uuid, uuid)
  to authenticated;

drop policy if exists "routes select assigned driver" on public.routes;
create policy "routes select assigned driver"
  on public.routes for select to authenticated
  using (public.driver_can_read_assigned_route(tenant_id, id));

comment on function public.driver_can_read_assigned_route(uuid, uuid) is
  'RLS-safe self-driver route predicate. Allows only the active driver identity assigned to the route today or operating an active trip.';
