import { supabase, supabaseConfigError } from '@/lib/supabase';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

/**
 * Fetch the PostGIS distance (in metres) between an active driver trip's latest
 * location and an active route stop on the same route. Calls the
 * get_admin_live_trip_stop_distance_metres RPC (migration 0056).
 *
 * The RPC is SECURITY DEFINER, tenant-scoped via current_tenant_id(), and
 * restricted to tenant/school/transportation admins. It uses ST_Distance on the
 * generated geography(Point, 4326) columns on driver_trip_current_locations
 * and route_stops.
 *
 * Returns null when the trip is not active, the stop is not active/on the same
 * route, or either location has no coordinates.
 */
export async function getAdminLiveTripStopDistanceMetres(
  driverTripId: string,
  routeStopId: string,
): Promise<number | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_admin_live_trip_stop_distance_metres', {
    p_driver_trip_id: driverTripId,
    p_route_stop_id: routeStopId,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load trip stop distance', error);
    throw new Error(error.message || 'Unable to load the trip stop distance.');
  }
  return (data as number | null) ?? null;
}