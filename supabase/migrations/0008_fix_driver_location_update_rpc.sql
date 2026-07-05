-- SafeBus Alberta - fix driver location update RPC
--
-- Corrective migration for Milestone 4B review blocker.
--
-- Problem in 0007_driver_location_update_foundation.sql:
--   The RPC declared `v_trip public.driver_trips;` and then used
--   `INSERT INTO public.driver_trip_current_locations (...) ... RETURNING * INTO v_trip;`
--   This assigns a `driver_trip_current_locations` row shape into a variable
--   typed as `driver_trips` — a row-type mismatch. At runtime this can corrupt
--   the variable or raise a type error, and the `RETURNING INTO` result was not
--   actually used (the function did a separate SELECT to return the row).
--
-- Fix:
--   Replace the function with a corrected version that:
--     - declares `v_current public.driver_trip_current_locations` for the
--       upsert RETURNING target (correct row type)
--     - returns `v_current` directly (no redundant second SELECT)
--     - preserves the IDENTICAL signature, security checks, and behaviour
--
-- This is a CREATE OR REPLACE of the existing function with the same signature,
-- so no grant changes are needed (the grant from 0007 still applies). The
-- function remains SECURITY DEFINER with `set search_path = public`. All
-- security checks (caller role, tenant, ownership, active status) are
-- preserved exactly. No RLS policies, grants, or table structures are changed.

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
  -- Correctly typed variable for the upserted current-location row. The
  -- previous version incorrectly captured the RETURNING result into v_trip
  -- (typed as driver_trips), which is a row-type mismatch.
  v_current public.driver_trip_current_locations;
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

  -- Upsert the current-location row for this trip and capture the result into
  -- the correctly typed v_current variable.
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
  returning * into v_current;

  -- Return the upserted current-location row directly. No second SELECT needed.
  return v_current;
end;
$$;

comment on function public.update_driver_trip_location(
  uuid, double precision, double precision, double precision, double precision, double precision, text
) is
  'Narrow secure path for a driver to update the location of their own active '
  'trip. Appends a history row and upserts the current-location row. Accepts '
  'only the trip id and geo inputs; tenant/driver/bus/route are derived from '
  'the validated active trip row. Enforces caller role, tenant, ownership, '
  'and active status. Corrective migration 0008 fixes the RETURNING INTO '
  'variable type mismatch from 0007 (v_trip was driver_trips; now uses '
  'v_current typed as driver_trip_current_locations).';

-- No grant changes: the grant from 0007 still applies to the replaced function
-- (same name + signature). No RLS policy, table, or index changes in this
-- migration.
