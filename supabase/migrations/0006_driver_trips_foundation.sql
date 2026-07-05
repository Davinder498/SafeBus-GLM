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
--   - driver can only end their own active trips
--
-- Also adds:
--   - public.current_driver_id() helper (mirrors current_guardian_id())
--   - public.driver_trip_entities_in_tenant() validation helper
--   - driver read policies on public.buses and public.routes so a driver can see
--     the active buses/routes in their tenant to select for a trip. These are
--     additive policies; existing admin policies are unchanged.

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

-- UPDATE policy: a driver may only end (complete/cancel) their own currently
-- active trip. USING restricts which rows can be touched (own + active).
-- WITH CHECK restricts the resulting row: still owned by the driver, still in
-- their tenant, and status moved to a terminal value. A driver cannot mutate
-- tenant_id, driver_id, bus_id, route_id, or reactivate a trip.
create policy "driver_trips update own driver"
  on public.driver_trips for update to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
    and status = 'active'
  )
  with check (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
    and status in ('completed', 'cancelled')
  );

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
grant select on table public.driver_trips to authenticated;
grant insert, update on table public.driver_trips to authenticated;
