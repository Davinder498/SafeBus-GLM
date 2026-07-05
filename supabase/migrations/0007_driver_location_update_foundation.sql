-- SafeBus Alberta - driver location update foundation
--
-- Milestone 4B: append-only driver trip location updates + a latest/current
-- location row per active trip, written exclusively through a secure RPC.
--
-- This migration intentionally excludes parent live map, admin live map, ETA,
-- route progress, notifications, QR scanning, and pickup/dropoff scanning.
--
-- Tables:
--   public.driver_trip_location_updates  (append-only history)
--   public.driver_trip_current_locations (one row per trip, latest position)
--
-- Write path:
--   Drivers may ONLY write location data by calling the
--   update_driver_trip_location() RPC. There is NO INSERT/UPDATE/DELETE policy
--   and NO INSERT/UPDATE/DELETE grant on either location table for any role.
--   The RPC is SECURITY DEFINER and enforces, server-side:
--     1. caller is a driver (current_user_role() = 'driver')
--     2. the trip is in the caller's tenant (tenant_id = current_tenant_id())
--     3. the trip belongs to the caller (driver_id = current_driver_id())
--     4. the trip is currently active (status = 'active')
--   The RPC accepts only the trip id + geo inputs from the client. It derives
--   tenant_id, driver_id, bus_id, and route_id from the existing active trip
--   row — never from the client. It then inserts one history row and upserts
--   the current-location row.
--
-- Read path:
--   Drivers can SELECT their own trip location rows (RLS). Tenant/school/
--   transportation admins can SELECT location rows in their tenant (RLS). No
--   public reads. Future parent tracking will add a narrower parent policy in
--   a later milestone; this milestone adds no parent policies.

-- ---------------------------------------------------------------------------
-- Table: driver_trip_location_updates (append-only history)
-- ---------------------------------------------------------------------------
create table public.driver_trip_location_updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading_deg double precision,
  speed_mps double precision,
  source text not null default 'browser',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint driver_trip_location_updates_latitude_check check (
    latitude between -90 and 90
  ),
  constraint driver_trip_location_updates_longitude_check check (
    longitude between -180 and 180
  ),
  constraint driver_trip_location_updates_accuracy_check check (
    accuracy_m is null or accuracy_m >= 0
  ),
  constraint driver_trip_location_updates_heading_check check (
    heading_deg is null or (heading_deg between 0 and 360)
  ),
  constraint driver_trip_location_updates_speed_check check (
    speed_mps is null or speed_mps >= 0
  ),
  constraint driver_trip_location_updates_source_check check (
    source in ('browser', 'manual')
  )
);

-- Indexes for operational lookups.
create index driver_trip_location_updates_tenant_id_idx
  on public.driver_trip_location_updates(tenant_id);
create index driver_trip_location_updates_driver_trip_id_idx
  on public.driver_trip_location_updates(driver_trip_id);
create index driver_trip_location_updates_trip_recorded_desc_idx
  on public.driver_trip_location_updates(driver_trip_id, recorded_at desc);
create index driver_trip_location_updates_tenant_recorded_idx
  on public.driver_trip_location_updates(tenant_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Table: driver_trip_current_locations (one row per trip, latest position)
-- ---------------------------------------------------------------------------
create table public.driver_trip_current_locations (
  driver_trip_id uuid primary key references public.driver_trips(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading_deg double precision,
  speed_mps double precision,
  source text not null default 'browser',
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trip_current_locations_latitude_check check (
    latitude between -90 and 90
  ),
  constraint driver_trip_current_locations_longitude_check check (
    longitude between -180 and 180
  ),
  constraint driver_trip_current_locations_accuracy_check check (
    accuracy_m is null or accuracy_m >= 0
  ),
  constraint driver_trip_current_locations_heading_check check (
    heading_deg is null or (heading_deg between 0 and 360)
  ),
  constraint driver_trip_current_locations_speed_check check (
    speed_mps is null or speed_mps >= 0
  ),
  constraint driver_trip_current_locations_source_check check (
    source in ('browser', 'manual')
  )
);

create index driver_trip_current_locations_tenant_id_idx
  on public.driver_trip_current_locations(tenant_id);
create index driver_trip_current_locations_driver_id_idx
  on public.driver_trip_current_locations(driver_id);
create index driver_trip_current_locations_tenant_recorded_desc_idx
  on public.driver_trip_current_locations(tenant_id, recorded_at desc);

-- updated_at trigger on the current-locations table (reuses set_updated_at()).
create trigger set_updated_at_driver_trip_current_locations
  before update on public.driver_trip_current_locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Both tables are SELECT-only for clients. No client (including a driver) can
-- INSERT/UPDATE/DELETE location rows directly — all writes go through the
-- update_driver_trip_location() RPC below.
-- ---------------------------------------------------------------------------
alter table public.driver_trip_location_updates enable row level security;
alter table public.driver_trip_current_locations enable row level security;

-- SELECT policies on the history table.
create policy "driver_trip_location_updates select platform admin"
  on public.driver_trip_location_updates for select to authenticated
  using (public.is_platform_super_admin());

create policy "driver_trip_location_updates select tenant admin"
  on public.driver_trip_location_updates for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trip_location_updates select school or transportation admin"
  on public.driver_trip_location_updates for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trip_location_updates select own driver"
  on public.driver_trip_location_updates for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- SELECT policies on the current-locations table.
create policy "driver_trip_current_locations select platform admin"
  on public.driver_trip_current_locations for select to authenticated
  using (public.is_platform_super_admin());

create policy "driver_trip_current_locations select tenant admin"
  on public.driver_trip_current_locations for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trip_current_locations select school or transportation admin"
  on public.driver_trip_current_locations for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "driver_trip_current_locations select own driver"
  on public.driver_trip_current_locations for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- ---------------------------------------------------------------------------
-- RPC: update_driver_trip_location
--
-- The ONLY path that writes driver location data. SECURITY DEFINER.
--
-- Accepts ONLY: p_driver_trip_id, p_latitude, p_longitude, and optional
-- p_accuracy_m, p_heading_deg, p_speed_mps, p_source. It does NOT accept
-- tenant_id, driver_id, bus_id, or route_id — those are read from the
-- existing driver_trips row, which guarantees they stay consistent with the
-- trip validated at start time and cannot become cross-tenant.
--
-- SECURITY NOTE on security definer + RLS:
--   This function is SECURITY DEFINER, so it executes with the privileges of
--   its owner and BYPASSES the table-level RLS policies on
--   driver_trip_location_updates and driver_trip_current_locations for the
--   INSERT and the upsert. The RLS SELECT policies do NOT gate access inside
--   this function. The REAL security guarantee is the function's own explicit
--   checks:
--     1. current_user_role() = 'driver'
--     2. the trip row exists and tenant_id = current_tenant_id()
--     3. the trip row's driver_id = current_driver_id()
--     4. the trip row's status = 'active'
--   These checks are the primary enforcement. The table RLS policies remain
--   in force for all direct (non-RPC) client SELECTs; they are simply not
--   relied upon inside this function.
-- ---------------------------------------------------------------------------
create or replace function public.update_driver_trip_location(
  p_driver_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null,
  p_source text default 'browser'
)
returns public.driver_trip_current_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.driver_trips;
  v_source text := coalesce(p_source, 'browser');
begin
  -- Caller must be a driver.
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can update trip location.' using errcode = '42501';
  end if;

  -- Lock the trip row so the active/ownership check is race-safe against a
  -- concurrent end_trip call.
  select * into v_trip
  from public.driver_trips
  where id = p_driver_trip_id
  for update;

  if not found then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Tenant isolation: the trip must be in the caller's tenant.
  if v_trip.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Driver self-ownership: the trip must belong to the caller.
  if v_trip.driver_id is distinct from public.current_driver_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Only an active trip can receive location updates.
  if v_trip.status <> 'active' then
    raise exception 'Cannot update location for a trip that is not active.' using errcode = '55006';
  end if;

  -- Validate source (defence-in-depth; the column check also enforces this).
  if v_source not in ('browser', 'manual') then
    v_source := 'browser';
  end if;

  -- Append one history row. tenant/driver/bus/route come from the validated
  -- trip row, never from the client.
  insert into public.driver_trip_location_updates (
    tenant_id, driver_trip_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at
  )
  values (
    v_trip.tenant_id, v_trip.id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps, v_source, now()
  );

  -- Upsert the current-location row for this trip.
  insert into public.driver_trip_current_locations (
    driver_trip_id, tenant_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at, updated_at
  )
  values (
    v_trip.id, v_trip.tenant_id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps, v_source, now(), now()
  )
  on conflict (driver_trip_id) do update
  set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    heading_deg = excluded.heading_deg,
    speed_mps = excluded.speed_mps,
    source = excluded.source,
    recorded_at = excluded.recorded_at,
    updated_at = now()
  returning * into v_trip;  -- reuse a declared variable to capture the return

  -- Return the current-location row.
  return (
    select * from public.driver_trip_current_locations
    where driver_trip_id = p_driver_trip_id
  );
end;
$$;

comment on function public.update_driver_trip_location(
  uuid, double precision, double precision, double precision, double precision, double precision, text
) is
  'Narrow secure path for a driver to update the location of their own active '
  'trip. Appends a history row and upserts the current-location row. Accepts '
  'only the trip id and geo inputs; tenant/driver/bus/route are derived from '
  'the validated active trip row. Enforces caller role, tenant, ownership, '
  'and active status.';

grant execute on function public.update_driver_trip_location(
  uuid, double precision, double precision, double precision, double precision, double precision, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- SELECT only: drivers read their own location rows (RLS), admins read tenant
-- location rows (RLS). INSERT/UPDATE/DELETE are intentionally NOT granted on
-- either table to any role — all writes go through update_driver_trip_location().
grant select on table public.driver_trip_location_updates to authenticated;
grant select on table public.driver_trip_current_locations to authenticated;
