// Guardian student route visibility types for Milestone 5A.
// Field names mirror the get_guardian_student_route_visibility() RPC columns.

export interface GuardianStudentRoute {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentPreferredName: string | null;
  studentGrade: string | null;
  routeAssignmentId: string | null;
  routeId: string | null;
  routeName: string | null;
  pickupStopName: string | null;
  dropoffStopName: string | null;
  assignmentStatus: string | null;
}

/** Display name for a student, using preferred name if available. */
export function studentDisplayName(route: GuardianStudentRoute): string {
  const base = `${route.studentFirstName} ${route.studentLastName}`;
  return route.studentPreferredName ? `${base} (${route.studentPreferredName})` : base;
}
