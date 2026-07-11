import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  GuardianStudentTripStatus,
  GuardianTripEventStatus,
} from '@/types/guardianTripEvent';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface GuardianTripEventRpcRow {
  student_id: string;
  student_display_name: string;
  route_name: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  student_trip_status: string | null;
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  last_event_time: string | null;
}

const knownStatuses = new Set<GuardianStudentTripStatus>([
  'no_active_trip',
  'not_picked_up',
  'picked_up',
  'dropped_off',
]);

function mapStatus(value: string | null): GuardianStudentTripStatus {
  if (value && knownStatuses.has(value as GuardianStudentTripStatus)) {
    return value as GuardianStudentTripStatus;
  }
  return 'no_active_trip';
}

function mapRow(row: GuardianTripEventRpcRow): GuardianTripEventStatus {
  return {
    studentId: row.student_id,
    studentDisplayName: row.student_display_name,
    routeName: row.route_name,
    pickupStopName: row.pickup_stop_name,
    dropoffStopName: row.dropoff_stop_name,
    studentTripStatus: mapStatus(row.student_trip_status),
    pickupEventTime: row.pickup_event_time,
    dropoffEventTime: row.dropoff_event_time,
    lastEventTime: row.last_event_time,
  };
}

/**
 * Fetch guardian-scoped pickup/drop-off status for linked students.
 *
 * Calls only the secure get_guardian_student_trip_event_visibility() RPC from
 * Milestone 8A. The returned UI model intentionally drops operational fields
 * such as trip status/direction and never exposes event ids, trip ids, driver
 * ids, bus ids, tenant ids, contacts, GPS, speed, ETA, QR, or audit metadata.
 */
export async function fetchGuardianTripEventStatuses(): Promise<GuardianTripEventStatus[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc(
    'get_guardian_student_trip_event_visibility',
  );

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load guardian student trip event visibility', error);
    }
    throw new Error('We could not load student trip status right now. Please try again.');
  }

  const rows = (data ?? []) as GuardianTripEventRpcRow[];
  return rows.map(mapRow);
}
