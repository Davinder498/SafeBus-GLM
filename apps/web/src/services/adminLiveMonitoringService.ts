import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { AdminLiveTrip } from '@/types/adminLiveMonitoring';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

/**
 * Raw row shape returned by the get_admin_live_trip_monitoring() RPC. Column
 * names mirror the RPC's RETURNS TABLE definition (snake_case).
 */
interface AdminLiveTripRpcRow {
  trip_id: string;
  tenant_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_email: string | null;
  bus_id: string;
  bus_label: string | null;
  route_id: string;
  route_name: string | null;
  trip_type: string | null;
  status: string;
  started_at: string;
  latest_latitude: number | null;
  latest_longitude: number | null;
  latest_location_at: string | null;
}

function mapRow(row: AdminLiveTripRpcRow): AdminLiveTrip {
  return {
    tripId: row.trip_id,
    tenantId: row.tenant_id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverEmail: row.driver_email,
    busId: row.bus_id,
    busLabel: row.bus_label,
    routeId: row.route_id,
    routeName: row.route_name,
    tripType: row.trip_type,
    status: row.status,
    startedAt: row.started_at,
    latestLatitude: row.latest_latitude,
    latestLongitude: row.latest_longitude,
    latestLocationAt: row.latest_location_at,
  };
}

/**
 * Fetch active driver trips with latest location for the caller's organization.
 *
 * Calls the secure get_admin_live_trip_monitoring() RPC, which enforces
 * authentication, admin role, and tenant isolation server-side. Returns only
 * active trips. Active trips without a location still appear (latestLatitude/
 * latestLongitude/latestLocationAt are null). No service-role key is used.
 *
 * Error handling: the raw Supabase/PostgREST error is logged only in
 * development (import.meta.env.DEV) and never reaches the UI. A generic
 * Error is thrown so callers cannot accidentally display backend details
 * (function names, schema hints, policy failure text, etc.) to users.
 */
export async function fetchAdminLiveTrips(): Promise<AdminLiveTrip[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_admin_live_trip_monitoring');

  if (error) {
    // Log the raw backend error only in development. Never surface it to the UI.
    if (import.meta.env.DEV) {
      console.error('Failed to load admin live trips', error);
    }
    throw new Error('Unable to load admin live trips');
  }

  const rows = (data ?? []) as AdminLiveTripRpcRow[];
  return rows.map(mapRow);
}
