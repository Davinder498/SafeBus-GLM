import { supabase, supabaseConfigError } from '@/lib/supabase';

export interface GuardianStudentStopAssignment {
  studentId: string;
  busNumber: string;
  tripName: string;
  direction: string;
  pickupStopName: string | null;
  dropoffStopName: string | null;
}

interface GuardianStudentStopRow {
  student_id: string;
  bus_number: string;
  trip_name: string;
  direction: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
}

export async function fetchGuardianStudentStops(): Promise<GuardianStudentStopAssignment[]> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_guardian_student_stops');
  if (error) throw new Error('We could not load your stop information.');
  return ((data ?? []) as GuardianStudentStopRow[]).map((row) => ({
    studentId: row.student_id,
    busNumber: row.bus_number,
    tripName: row.trip_name,
    direction: row.direction,
    pickupStopName: row.pickup_stop_name,
    dropoffStopName: row.dropoff_stop_name,
  }));
}
