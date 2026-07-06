-- SafeBus Alberta - driver assignment foundation
--
-- Milestone 4F: tenant-admin-controlled driver assignments so drivers start
-- trips from assigned work (driver + bus + route + trip type) instead of
-- freely choosing any tenant bus/route.
--
-- This migration adds:
--   1. public.driver_route_assignments table
--   2. RLS policies (admin CRUD tenant-scoped; driver read own only)
--   3. public.start_driver_trip_from_assignment() RPC (SECURITY DEFINER) — the
--      secure backend path that creates a driver_trips row from a validated
--      assignment
--   4. Grants/revokes
--
-- No existing tables are altered. No existing data is deleted. No RLS is
-- weakened. The existing start-driver-trip direct-insert path (from 4A) remains
-- for backward compatibility but the driver dashboard will use the new RPC.

-- ---------------------------------------------------------------------------
-- Table: driver_route_assignments
-- ---------------------------------------------------------------------------
create table public.driver_route_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  trip_type text not null,
  status text not null default 'active',
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_route_assignments_trip_type_check check (
    trip_type in ('morning', 'evening')
  ),
  constraint driver_route_assignments_status_check check (
    status in ('active', 'inactive')
  ),
  constraint driver_route_assignments_effective_dates_check check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

-- Indexes for operational lookups.
create index driver_route_assignments_tenant_id_idx on public.driver_route_assignments(tenant_id);
create index driver_route_assignments_driver_id_idx on public.driver_route_assignments(driver_id);
create index driver_route_assignments_bus_id_idx on public.driver_route_assignments(bus_id);
create index driver_route_assignments_route_id_idx on public.driver_route_assignments(route_id);
create index driver_route_assignments_status_idx on public.driver_route_assignments(status);
create index driver_route_assignments_driver_status_idx on public.driver_route_assignments(driver_id, status);
create index driver_route_assignments_tenant_status_idx on public.driver_route_assignments(tenant_id, status);

-- Prevent duplicate active assignments for the exact same driver + bus + route + trip type.
create unique index driver_route_assignments_active_unique
  on public.driver_route_assignments(driver_id, bus_id, route_id, trip_type)
  where status = 'active';

-- updated_at trigger (reuses the existing set_updated_at() function).
create trigger set_updated_at_driver_route_assignments
  before update on public.driver_route_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: validate that driver, bus, and route all belong to the same tenant.
-- Used by the INSERT/UPDATE RLS WITH CHECK so an admin cannot create a
-- cross-tenant assignment (e.g., tenant A driver + tenant B bus).
-- ---------------------------------------------------------------------------
create or replace function public.driver_assignment_entities_in_tenant(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_bus_id uuid,
  p_route_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.drivers d
      where d.id = p_driver_id and d.tenant_id = p_tenant_id and d.status = 'active'
    )
    and exists (
      select 1 from public.buses b
      where b.id = p_bus_id and b.tenant_id = p_tenant_id and b.status = 'active'
    )
    and exists (
      select 1 from public.routes r
      where r.id = p_route_id and r.tenant_id = p_tenant_id and r.status = 'active'
    );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.driver_route_assignments enable row level security;

-- SELECT policies
create policy "driver_route_assignments select platform admin"
  on public.driver_route_assignments for select to authenticated
  using (public.is_platform_super_admin());

create policy "driver_route_assignments select tenant admin"
  on public.driver_route_assignments for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_route_assignments select school or transportation admin"
  on public.driver_route_assignments for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_route_assignments select own driver"
  on public.driver_route_assignments for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- INSERT policy: transportation write admins can create assignments in their
-- tenant. The WITH CHECK ensures driver/bus/route are all in the same tenant
-- and active. tenant_id is verified against current_tenant_id().
create policy "driver_route_assignments insert admin"
  on public.driver_route_assignments for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.driver_assignment_entities_in_tenant(tenant_id, driver_id, bus_id, route_id)
  );

-- UPDATE policy: transportation write admins can update assignments in their
-- tenant (e.g., change status to inactive). The WITH CHECK re-validates
-- tenant + entities so an admin cannot move an assignment to another tenant
-- or to a cross-tenant bus/route.
create policy "driver_route_assignments update admin"
  on public.driver_route_assignments for update to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.driver_assignment_entities_in_tenant(tenant_id, driver_id, bus_id, route_id)
  );

-- No DELETE policy: assignments should be deactivated, not deleted, to
-- preserve audit history (same convention as other transportation tables).

-- ---------------------------------------------------------------------------
-- RPC: start_driver_trip_from_assignment
--
-- The secure backend path that creates a driver_trips row from a validated
-- assignment. SECURITY DEFINER with set search_path = public.
--
-- Accepts ONLY: p_assignment_id. Does NOT accept tenant_id, driver_id, bus_id,
-- route_id, or trip_type from the client — all are read from the validated
-- assignment row.
--
-- SECURITY NOTE on security definer + RLS:
--   This function is SECURITY DEFINER, so it executes with the privileges of
--   its owner and BYPASSES table-level RLS on driver_route_assignments and
--   driver_trips for the qualifying SELECT and the INSERT. The REAL security
--   guarantee is the function's own explicit checks:
--     1. current_user_role() = 'driver'
--     2. the assignment exists and tenant_id = current_tenant_id()
--     3. the assignment's driver_id = current_driver_id()
--     4. the assignment's status = 'active'
--   The partial unique indexes on driver_trips (one active trip per driver/bus)
--   prevent concurrent active trips.
-- ---------------------------------------------------------------------------
create or replace function public.start_driver_trip_from_assignment(p_assignment_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.driver_route_assignments;
  v_trip public.driver_trips;
begin
  -- Caller must be a driver.
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can start a trip.' using errcode = '42501';
  end if;

  -- Lock the assignment row for the duration of this transaction.
  select * into v_assignment
  from public.driver_route_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  -- Tenant isolation: the assignment must be in the caller's tenant.
  if v_assignment.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  -- Driver self-ownership: the assignment must belong to the caller.
  if v_assignment.driver_id is distinct from public.current_driver_id() then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  -- Only an active assignment can start a trip.
  if v_assignment.status <> 'active' then
    raise exception 'This assignment is not active.' using errcode = '55006';
  end if;

  -- Insert the new driver_trips row using the assignment's values. The partial
  -- unique indexes on driver_trips will raise a unique violation if the driver
  -- or bus already has an active trip.
  begin
    insert into public.driver_trips (
      tenant_id, driver_id, bus_id, route_id, trip_type, status,
      service_date, started_at
    )
    values (
      v_assignment.tenant_id, v_assignment.driver_id, v_assignment.bus_id,
      v_assignment.route_id, v_assignment.trip_type, 'active',
      current_date, now()
    )
    returning * into v_trip;
  exception
    when unique_violation then
      -- Check which unique index was violated for a friendly error.
      if exists (
        select 1 from public.driver_trips
        where driver_id = v_assignment.driver_id and status = 'active'
      ) then
        raise exception 'You already have an active trip. End it before starting a new one.' using errcode = '55006';
      else
        raise exception 'This bus already has an active trip. End the existing trip or choose a different assignment.' using errcode = '55006';
      end if;
  end;

  return v_trip;
end;
$$;

comment on function public.start_driver_trip_from_assignment(uuid) is
  'Narrow secure path for a driver to start a trip from their own active '
  'assignment. Accepts only the assignment id; tenant/driver/bus/route/trip_type '
  'are derived from the validated assignment row. Enforces caller role, tenant, '
  'ownership, and active status. Preserves the one-active-trip-per-driver and '
  'one-active-trip-per-bus invariants via partial unique indexes.';

-- Execute privilege: grant only to authenticated; revoke from public/anon.
revoke all on function public.start_driver_trip_from_assignment(uuid) from public;
revoke all on function public.start_driver_trip_from_assignment(uuid) from anon;
grant execute on function public.start_driver_trip_from_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants on the assignment table
-- ---------------------------------------------------------------------------
-- SELECT: admins read tenant assignments (RLS), drivers read own (RLS).
-- INSERT/UPDATE: admins create/deactivate assignments (RLS WITH CHECK).
-- No DELETE grant (assignments are deactivated, not deleted).
grant select on table public.driver_route_assignments to authenticated;
grant insert, update on table public.driver_route_assignments to authenticated;
