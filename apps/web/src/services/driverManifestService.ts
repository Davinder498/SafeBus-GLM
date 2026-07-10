import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverManifestRow } from '@/types/driverManifest';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface DriverManifestRpcRow {
  active_trip_id: string;
  student_id: string | null;
  student_display_name: string | null;
  route_name: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
}

function mapRow(row: DriverManifestRpcRow): DriverManifestRow {
  return {
    activeTripId: row.active_trip_id,
    studentId: row.student_id,
    studentDisplayName: row.student_display_name,
    routeName: row.route_name,
    tripStatus: row.trip_status,
    tripDirection: row.trip_direction,
    pickupStopName: row.pickup_stop_name,
    dropoffStopName: row.dropoff_stop_name,
    assignmentStatus: row.assignment_status,
  };
}

/**
 * Fetch the authenticated driver's active-trip student manifest through the
 * driver-only RPC. The browser does not read student manifest tables directly.
 */
export async function fetchDriverActiveTripStudentManifest(): Promise<DriverManifestRow[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_driver_active_trip_student_manifest');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load driver active trip student manifest', error);
    }
    throw new Error('Could not load student manifest right now. Please try again.');
  }

  return ((data ?? []) as DriverManifestRpcRow[]).map(mapRow);
}
