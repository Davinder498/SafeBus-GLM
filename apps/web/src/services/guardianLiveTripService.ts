import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { GuardianLiveTrip } from '@/types/guardianLiveTrip';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface GuardianLiveTripRpcRow {
  student_id: string;
  student_name: string;
  route_id: string;
  route_name: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  trip_status: string | null;
  has_active_trip: boolean;
  last_location_latitude: number | null;
  last_location_longitude: number | null;
  last_location_recorded_at: string | null;
}

function mapRow(row: GuardianLiveTripRpcRow): GuardianLiveTrip {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    routeId: row.route_id,
    routeName: row.route_name,
    pickupStopName: row.pickup_stop_name,
    dropoffStopName: row.dropoff_stop_name,
    tripStatus: row.trip_status,
    hasActiveTrip: row.has_active_trip,
    lastLocationLatitude: row.last_location_latitude,
    lastLocationLongitude: row.last_location_longitude,
    lastLocationRecordedAt: row.last_location_recorded_at,
  };
}

/**
 * Fetch minimal, safe live trip visibility for the guardian's linked students.
 *
 * Calls the secure get_guardian_live_trip_visibility() RPC, which enforces
 * guardian role, tenant isolation, active guardian-student link validation, and
 * active-route-assignment filtering server-side. Returns only the caller's
 * linked students' routes with the latest position of any active trip. Does NOT
 * expose bus id, driver id, trip uuid, speed, or location history. Raw backend
 * errors are logged in DEV only and a safe user-facing message is thrown.
 */
export async function fetchGuardianLiveTrips(): Promise<GuardianLiveTrip[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_guardian_live_trip_visibility');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load guardian live trip visibility', error);
    }
    throw new Error('We could not load live bus status. Please try again.');
  }

  const rows = (data ?? []) as GuardianLiveTripRpcRow[];
  return rows.map(mapRow);
}