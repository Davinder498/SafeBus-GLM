import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  DriverTripCurrentLocation,
  LocationSource,
  UpdateLocationInput,
  UpdateLocationResult,
} from '@/types/driverLocation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const currentLocationColumns =
  'driver_trip_id, tenant_id, driver_id, bus_id, route_id, latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at, updated_at';

/**
 * Validate the numeric geo inputs client-side before calling the RPC. The RPC
 * re-validates everything server-side; this is just to avoid obviously-bad
 * requests and give the driver a friendly error.
 */
function validateGeoInput(input: UpdateLocationInput): void {
  if (!input.driverTripId) {
    throw new Error('Missing trip id.');
  }
  if (typeof input.latitude !== 'number' || Number.isNaN(input.latitude)) {
    throw new Error('Invalid latitude.');
  }
  if (typeof input.longitude !== 'number' || Number.isNaN(input.longitude)) {
    throw new Error('Invalid longitude.');
  }
  if (input.latitude < -90 || input.latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.');
  }
  if (input.longitude < -180 || input.longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.');
  }
  if (input.accuracyM != null && (typeof input.accuracyM !== 'number' || input.accuracyM < 0)) {
    throw new Error('Accuracy must be a non-negative number.');
  }
  if (input.headingDeg != null && (typeof input.headingDeg !== 'number' || input.headingDeg < 0 || input.headingDeg > 360)) {
    throw new Error('Heading must be between 0 and 360.');
  }
  if (input.speedMps != null && (typeof input.speedMps !== 'number' || input.speedMps < 0)) {
    throw new Error('Speed must be a non-negative number.');
  }
}

/**
 * Update the active trip's location via the secure update_driver_trip_location
 * RPC. The RPC is the ONLY path that writes location data — there is no
 * INSERT/UPDATE grant on the location tables. The RPC derives tenant_id,
 * driver_id, bus_id, and route_id from the active trip row and enforces
 * caller role, tenant, ownership, and active status server-side.
 *
 * The client passes only the trip id + geo inputs.
 */
export async function updateDriverTripLocation(
  input: UpdateLocationInput,
): Promise<UpdateLocationResult> {
  validateGeoInput(input);
  const client = requireSupabase();

  const { data, error } = await client.rpc('update_driver_trip_location', {
    p_driver_trip_id: input.driverTripId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_accuracy_m: input.accuracyM ?? null,
    p_heading_deg: input.headingDeg ?? null,
    p_speed_mps: input.speedMps ?? null,
    p_source: (input.source ?? 'browser') as LocationSource,
  });

  if (error) {
    const message = error.message ?? 'Could not update location.';
    if (message.includes('not active')) {
      throw new Error('This trip is no longer active. Location sharing stopped.');
    }
    if (message.includes('not found') || message.includes('Only a driver')) {
      throw new Error('Could not update location. This trip may belong to another driver.');
    }
    throw new Error(message);
  }

  const row = data as DriverTripCurrentLocation | null;
  if (!row) {
    throw new Error('Location update returned no result.');
  }

  return {
    driver_trip_id: row.driver_trip_id,
    recorded_at: row.recorded_at,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * Fetch the latest/current location row for a trip. Scoped by RLS to the
 * authenticated driver's own trips (or tenant admins).
 */
export async function fetchCurrentLocation(
  driverTripId: string,
): Promise<DriverTripCurrentLocation | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('driver_trip_current_locations')
    .select(currentLocationColumns)
    .eq('driver_trip_id', driverTripId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as DriverTripCurrentLocation | null) ?? null;
}
