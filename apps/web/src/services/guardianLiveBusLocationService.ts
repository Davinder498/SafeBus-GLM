import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  GuardianBusAssignmentState,
  GuardianBusVisibility,
  GuardianLiveBusLocationState,
  GuardianStudentTripStatus,
} from '@/types/guardianLiveBusLocation';

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export interface GuardianBusVisibilityRpcRow {
  student_id: string;
  student_name: string;
  student_grade: string | null;
  assignment_state: GuardianBusAssignmentState;
  bus_number: string | null;
  license_plate: string | null;
  has_active_trip: boolean;
  location_state: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
  location_age_seconds: number | null;
  eta_status: string | null;
  eta_label: string | null;
  student_trip_status: GuardianStudentTripStatus;
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  last_event_time: string | null;
}

export function mapGuardianBusVisibilityRow(
  row: GuardianBusVisibilityRpcRow,
): GuardianBusVisibility {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    studentGrade: row.student_grade,
    assignmentState: row.assignment_state,
    busNumber: row.bus_number,
    licensePlate: row.license_plate,
    hasActiveTrip: row.has_active_trip,
    locationState: row.location_state,
    latitude: row.latitude,
    longitude: row.longitude,
    locationRecordedAt: row.location_recorded_at,
    locationAgeSeconds: row.location_age_seconds,
    etaStatus: row.eta_status,
    etaLabel: row.eta_label,
    studentTripStatus: row.student_trip_status,
    pickupEventTime: row.pickup_event_time,
    dropoffEventTime: row.dropoff_event_time,
    lastEventTime: row.last_event_time,
  };
}

/** Load the guardian's linked students and bus-only visibility state. */
export async function fetchGuardianBusVisibility(): Promise<GuardianBusVisibility[]> {
  const { data, error } = await requireSupabase().rpc('get_guardian_bus_visibility');
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load guardian bus visibility', error);
    throw new Error('We could not load your bus information. Please try again.');
  }
  return ((data ?? []) as GuardianBusVisibilityRpcRow[]).map(mapGuardianBusVisibilityRow);
}

// Retain the hook-facing name while using the single bus-first server contract.
export const fetchGuardianLiveBusLocations = fetchGuardianBusVisibility;
