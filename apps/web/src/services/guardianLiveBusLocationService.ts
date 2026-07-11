import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { GuardianLiveBusLocationState, GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface GuardianLiveBusLocationRpcRow {
  student_id: string;
  location_state: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
  location_age_seconds: number | null;
}

function mapRow(row: GuardianLiveBusLocationRpcRow): GuardianStudentLiveBusLocation {
  return {
    studentId: row.student_id,
    locationState: row.location_state,
    latitude: row.latitude,
    longitude: row.longitude,
    locationRecordedAt: row.location_recorded_at,
    locationAgeSeconds: row.location_age_seconds,
  };
}

/**
 * Fetch the safe guardian live bus location state for actively linked students.
 *
 * The server RPC derives identity from auth.uid(), accepts no scope arguments,
 * and returns only student-correlated safe location state. This wrapper does
 * not add polling, realtime subscriptions, map behavior, or UI state.
 */
export async function fetchGuardianLiveBusLocations(): Promise<GuardianStudentLiveBusLocation[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_guardian_student_live_bus_location_state');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load guardian live bus location state', error);
    }
    throw new Error('We could not load live bus location state. Please try again.');
  }

  const rows = (data ?? []) as GuardianLiveBusLocationRpcRow[];
  return rows.map(mapRow);
}
