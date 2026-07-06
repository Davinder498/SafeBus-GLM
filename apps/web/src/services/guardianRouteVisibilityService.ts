import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { GuardianStudentRoute } from '@/types/guardianRouteVisibility';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface GuardianStudentRouteRpcRow {
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_preferred_name: string | null;
  student_grade: string | null;
  route_assignment_id: string | null;
  route_id: string | null;
  route_name: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
}

function mapRow(row: GuardianStudentRouteRpcRow): GuardianStudentRoute {
  return {
    studentId: row.student_id,
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    studentPreferredName: row.student_preferred_name,
    studentGrade: row.student_grade,
    routeAssignmentId: row.route_assignment_id,
    routeId: row.route_id,
    routeName: row.route_name,
    pickupStopName: row.pickup_stop_name,
    dropoffStopName: row.dropoff_stop_name,
    assignmentStatus: row.assignment_status,
  };
}

/**
 * Fetch the guardian's linked students and their route assignment summaries.
 *
 * Calls the secure get_guardian_student_route_visibility() RPC, which enforces
 * guardian role, tenant isolation, and student-guardian link validation
 * server-side. Returns only the caller's linked students. No live location,
 * bus, or trip data is exposed. Raw backend errors are logged in DEV only.
 */
export async function fetchGuardianStudentRoutes(): Promise<GuardianStudentRoute[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_guardian_student_route_visibility');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load guardian student route visibility', error);
    }
    throw new Error('We could not load your student route information. Please try again.');
  }

  const rows = (data ?? []) as GuardianStudentRouteRpcRow[];
  return rows.map(mapRow);
}
