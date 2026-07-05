-- SafeBus Alberta - driver trip operations foundation
--
-- Milestone 4A: driver-side trip/session model so future milestones can attach
-- live GPS, parent tracking, route progress, ETA, pickup/dropoff, and notifications.
--
-- This migration intentionally excludes live GPS, maps, QR codes, scan events,
-- notifications, SMS, CSV import, and integrations.
--
-- Table: public.driver_trips
--   - one active trip per driver (partial unique index)
--   - one active trip per bus (partial unique index)
--   - tenant-scoped
--   - driver can only create trips for themselves
--   - driver can only end their own active trips, and ONLY via the
--     end_driver_trip() RPC (see below). There is NO UPDATE policy and NO
--     UPDATE grant for drivers, so a driver cannot mutate any column of a
--     driver_trips row through the normal Supabase REST update path. The RPC
--     sets only status and ended_at; all other columns are immutable from the
--     driver's perspective.
--
-- Also adds:
--   - public.current_driver_id() helper (mirrors current_guardian_id())
--   - public.driver_trip_entities_in_tenant() validation helper
--   - public.end_driver_trip() RPC — the single narrow path a driver uses to
--     end a trip. Enforces: caller is a driver, the trip belongs to the caller
--     (driver_id = current_driver_id()), the trip is in the caller's tenant
--     (tenant_id = current_tenant_id()), and the trip is currently active.
--     Sets ONLY status='completed' and ended_at=now(). Never accepts or mutates
--     tenant_id, driver_id, bus_id, route_id, trip_type, service_date,
--     started_at, or created_at.
--   - driver read policies on public.buses and public.routes so a driver can
--     see the active buses/routes in their tenant to select for a trip. These
--     are additive policies; existing admin policies are unchanged.

-- ---------------------------------------------------------------------------
-- Helper: current driver row id for the authenticated user.
-- Mirrors current_guardian_id(). Returns the drivers.id for the active driver
-- profile linked to auth.uid() within the current tenant.
-- ---------------------------------------------------------------------------
create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.drivers
  where profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and status = 'active'
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Helper: validate that the bus and route referenced by a trip belong to the
-- same tenant and are active. Used by the insert RLS WITH CHECK so a driver
-- cannot start a trip with a bus/route from another tenant or a retired/
-- archived bus/route.
-- ---------------------------------------------------------------------------
create or replace function public.driver_trip_entities_in_tenant(
  p_tenant_id uuid,
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
      select 1
      from public.buses b
      where b.id = p_bus_id
        and b.tenant_id = p_tenant_id
        and b.status = 'active'
    )
    and exists (
      select 1
      from public.routes r
      where r.id = p_route_id
        and r.tenant_id = p_tenant_id
        and r.status = 'active'
    );
$$;

-- ---------------------------------------------------------------------------
-- Table: driver_trips
-- ---------------------------------------------------------------------------
create table public.driver_trips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  trip_type text not null,
  status text not null default 'active',
  service_date date not null default current_date,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trips_trip_type_check check (
    trip_type in ('morning', 'evening')
  ),
  constraint driver_trips_status_check check (
    status in ('active', 'completed', 'cancelled')
  ),
  constraint driver_trips_active_ended_at_check check (
    (status = 'active' and ended_at is null)
    or (status in ('completed', 'cancelled') and ended_at is not null)
  ),
  constraint driver_trips_ended_after_started_check check (
    ended_at is null or ended_at >= started_at
  )
);

-- Indexes for operational lookups.
create index driver_trips_tenant_id_idx on public.driver_trips(tenant_id);
create index driver_trips_driver_id_idx on public.driver_trips(driver_id);
create index driver_trips_bus_id_idx on public.driver_trips(bus_id);
create index driver_trips_route_id_idx on public.driver_trips(route_id);
create index driver_trips_service_date_idx on public.driver_trips(service_date);
create index driver_trips_status_idx on public.driver_trips(status);

-- Partial indexes to find a driver's / bus's active trip quickly.
create index driver_trips_driver_active_idx
  on public.driver_trips(driver_id)
  where status = 'active';
create index driver_trips_bus_active_idx
  on public.driver_trips(bus_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Constraints: at most one active trip per driver and per bus.
-- Implemented as partial unique indexes so completed/cancelled history can
-- coexist without blocking a new trip after the previous one ends.
-- ---------------------------------------------------------------------------
create unique index driver_trips_driver_active_unique
  on public.driver_trips(driver_id)
  where status = 'active';

create unique index driver_trips_bus_active_unique
  on public.driver_trips(bus_id)
  where status = 'active';

-- updated_at trigger (reuses the existing set_updated_at() function).
create trigger set_updated_at_driver_trips
  before update on public.driver_trips
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.driver_trips enable row level security;

-- SELECT policies
create policy "driver_trips select platform admin"
  on public.driver_trips for select to authenticated
  using (public.is_platform_super_admin());

create policy "driver_trips select tenant admin"
  on public.driver_trips for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trips select school or transportation admin"
  on public.driver_trips for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trips select own driver"
  on public.driver_trips for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- INSERT policy: a driver may only start a trip for themselves, in their own
-- tenant, with status 'active', and referencing an active bus and route in the
-- same tenant. tenant_id and driver_id are not trusted from the client; RLS
-- verifies them against the authenticated identity.
create policy "driver_trips insert own driver"
  on public.driver_trips for insert to authenticated
  with check (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
    and status = 'active'
    and public.driver_trip_entities_in_tenant(tenant_id, bus_id, route_id)
  );

-- ---------------------------------------------------------------------------
-- Ending a trip: end_driver_trip() RPC (NO UPDATE policy, NO UPDATE grant).
--
-- There is deliberately NO UPDATE policy on public.driver_trips and NO UPDATE
-- grant to any role. This means no client (including a driver) can issue a
-- normal Supabase REST PATCH/UPDATE against driver_trips. The ONLY way a driver
-- can end a trip is by calling the end_driver_trip(p_trip_id) RPC.
--
-- The RPC enforces, server-side:
--   1. caller is a driver (current_user_role() = 'driver')
--   2. the trip is in the caller's tenant (tenant_id = current_tenant_id())
--   3. the trip belongs to the caller (driver_id = current_driver_id())
--   4. the trip is currently active (status = 'active')
-- It then sets ONLY status = 'completed' and ended_at = now(). It never reads,
-- accepts, or mutates tenant_id, driver_id, bus_id, route_id, trip_type,
-- service_date, started_at, created_at, or updated_at from the client. Because
-- the RPC takes only p_trip_id, there is no parameter surface through which a
-- client could attempt to alter other columns. The updated_at trigger fires
-- normally. bus_id and route_id are therefore guaranteed to remain the
-- in-tenant values validated at insert time; they cannot become cross-tenant
-- inconsistent.
-- ---------------------------------------------------------------------------
create or replace function public.end_driver_trip(p_trip_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.driver_trips;
begin
  -- Caller must be a driver.
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can end a trip.' using errcode = '42501';
  end if;

  -- Lock the target row for the duration of this transaction so the active
  -- status check is race-safe against a concurrent end/cancel.
  select * into v_row
  from public.driver_trips
  where id = p_trip_id
  for update;

  if not found then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Tenant isolation: the trip must be in the caller's tenant.
  if v_row.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Driver self-ownership: the trip must belong to the caller.
  if v_row.driver_id is distinct from public.current_driver_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Only an active trip can be ended.
  if v_row.status <> 'active' then
    raise exception 'This trip is not active.' using errcode = '55006';
  end if;

  -- Mutate ONLY status and ended_at. All other columns are left untouched.
  update public.driver_trips
  set status = 'completed', ended_at = now()
  where id = p_trip_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.end_driver_trip(uuid) is
  'Narrow secure path for a driver to end their own active trip. Sets only '
  'status=''completed'' and ended_at=now(). Does not accept or mutate any '
  'other column. Enforces caller role, tenant, ownership, and active status.';

-- Execute grant on the end-trip RPC for authenticated users.
--
-- SECURITY NOTE on security definer + RLS:
--   This function is SECURITY DEFINER, so it executes with the privileges of
--   its owner and BYPASSES the table-level RLS policies on public.driver_trips
--   for both the qualifying SELECT and the UPDATE it performs. The table's RLS
--   SELECT policies do NOT gate access inside this function. The REAL security
--   guarantee is therefore the function's own explicit checks:
--     1. current_user_role() = 'driver'
--     2. tenant_id = current_tenant_id()
--     3. driver_id = current_driver_id()
--     4. status = 'active'
--   These checks are the primary enforcement, not a defense-in-depth backstop.
--   The table RLS policies remain in force for all direct (non-RPC) client
--   SELECTs and for the INSERT path; they are simply not relied upon here.
grant execute on function public.end_driver_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Additive driver read policies on buses and routes.
--
-- Drivers previously had no SELECT access to buses or routes. To start a trip a
-- driver must see the active buses and routes in their tenant. These policies
-- are additive: existing admin policies are unchanged and still apply.
-- ---------------------------------------------------------------------------
create policy "buses select driver tenant active"
  on public.buses for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and status = 'active'
  );

create policy "routes select driver tenant active"
  on public.routes for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and status = 'active'
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- SELECT: drivers read their own trips (RLS), admins read tenant trips (RLS).
-- INSERT: drivers start trips (RLS WITH CHECK enforces self + tenant + active
--   bus/route in tenant).
-- UPDATE: intentionally NOT granted. Drivers end trips exclusively via the
--   end_driver_trip() RPC above, which is the only path that mutates a trip
--   and which sets only status + ended_at. This prevents a driver from
--   mutating tenant_id, driver_id, bus_id, route_id, trip_type, service_date,
--   started_at, or created_at through the REST update path.
grant select on table public.driver_trips to authenticated;
grant insert on table public.driver_trips to authenticated;
-- end_driver_trip() RPC grant is issued above, immediately after the function.
