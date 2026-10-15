import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { StudentQrTripStatus } from '@/utils/studentQr';

export type StudentQrEventType = 'picked_up' | 'dropped_off';
export type StudentQrOutcome = 'recorded' | 'already_recorded' | 'pickup_required' | 'complete';
export interface StudentQrScanResult {
  studentId: string;
  studentDisplayName: string;
  pickupStopName: string | null;
  dropoffStopName: string | null;
  studentTripStatus: StudentQrTripStatus;
  outcome: StudentQrOutcome;
}

/** Authorization and the requested event are checked together against the displayed trip. */
export async function recordStudentQrEvent(
  token: string,
  eventType: StudentQrEventType,
  tripId: string,
): Promise<StudentQrScanResult> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  const { data, error } = await supabase.rpc('record_student_qr_event_for_active_trip', {
    p_qr_token: token,
    p_event_type: eventType,
    p_driver_trip_id: tripId,
  });
  // A transport failure may follow a committed event. Retry the same event:
  // the server returns already_recorded without sending notifications again.
  const invalid = () => new Error('Could not confirm this scan. Retry the same event.');
  if (error || !Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object')
    throw invalid();
  const row = data[0] as Record<string, unknown>;
  const status = row.student_trip_status;
  const outcome = row.outcome;
  if (
    typeof row.student_id !== 'string' ||
    !row.student_id ||
    typeof row.student_display_name !== 'string' ||
    ![row.pickup_stop_name, row.dropoff_stop_name].every(
      (name) => name === null || typeof name === 'string',
    ) ||
    (status !== 'not_picked_up' && status !== 'picked_up' && status !== 'dropped_off') ||
    (outcome !== 'recorded' &&
      outcome !== 'already_recorded' &&
      outcome !== 'pickup_required' &&
      outcome !== 'complete')
  )
    throw invalid();
  return {
    studentId: row.student_id,
    studentDisplayName: row.student_display_name,
    pickupStopName: row.pickup_stop_name as string | null,
    dropoffStopName: row.dropoff_stop_name as string | null,
    studentTripStatus: status,
    outcome,
  };
}
