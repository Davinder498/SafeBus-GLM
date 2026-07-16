import { supabase, supabaseConfigError } from '@/lib/supabase';
import { mapStudentQrError, type StudentQrTripStatus } from '@/utils/studentQr';

function requireSupabase() { if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.'); return supabase; }

export interface StudentQrScanResult {
  studentId: string;
  studentDisplayName: string;
  pickupStopName: string | null;
  dropoffStopName: string | null;
  studentTripStatus: StudentQrTripStatus;
  nextEventType: 'picked_up' | 'dropped_off' | null;
  message: string;
}
interface RpcRow { student_id: string; student_display_name: string; pickup_stop_name: string | null; dropoff_stop_name: string | null; student_trip_status: StudentQrTripStatus; next_event_type: 'picked_up' | 'dropped_off' | null; message: string }
export async function resolveStudentQrForActiveTrip(token: string): Promise<StudentQrScanResult> {
  const { data, error } = await requireSupabase().rpc('resolve_student_qr_for_active_trip', { p_qr_token: token });
  if (error) throw new Error(mapStudentQrError());
  const row = (data as RpcRow[])[0];
  return { studentId: row.student_id, studentDisplayName: row.student_display_name, pickupStopName: row.pickup_stop_name, dropoffStopName: row.dropoff_stop_name, studentTripStatus: row.student_trip_status, nextEventType: row.next_event_type, message: row.message };
}
