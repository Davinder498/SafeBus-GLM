import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverActiveTripRouteShape } from '@/types/transportation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface DriverActiveTripRouteShapeRpcRow {
  driver_trip_id: string;
  route_shape_id: string;
  route_id: string;
  version: number;
  distance_meters: number;
  geojson: unknown;
}

/**
 * Fetch the route shape snapshot for the current driver's active trip. Calls
 * the get_driver_active_trip_route_shape RPC (migration 0057).
 *
 * The RPC is SECURITY DEFINER and enforces that the caller is a driver, the
 * trip belongs to the caller's tenant, and the trip is active. The route shape
 * is the version snapshot taken at trip start (driver_trips.route_shape_id).
 * Returns null when the driver has no active trip or the trip has no shape.
 */
export async function fetchDriverActiveTripRouteShape(): Promise<DriverActiveTripRouteShape | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_driver_active_trip_route_shape');
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load driver active trip route shape', error);
    throw new Error(error.message || 'Unable to load the route shape.');
  }
  const rows = (data ?? []) as DriverActiveTripRouteShapeRpcRow[];
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    driverTripId: row.driver_trip_id,
    routeShapeId: row.route_shape_id,
    routeId: row.route_id,
    version: row.version,
    distanceMeters: row.distance_meters,
    geojson: (row.geojson ?? null) as DriverActiveTripRouteShape['geojson'],
  };
}