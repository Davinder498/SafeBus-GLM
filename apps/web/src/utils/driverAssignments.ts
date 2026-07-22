import type { DriverAssignmentSummary, DriverRouteAssignment } from '@/types/driverAssignments';

export function isDriverAssignmentCurrentOn(
  assignment: Pick<DriverRouteAssignment, 'effective_from' | 'effective_to'>,
  serviceDate: string,
): boolean {
  return (
    (!assignment.effective_from || assignment.effective_from <= serviceDate) &&
    (!assignment.effective_to || assignment.effective_to >= serviceDate)
  );
}

/**
 * Builds the bus-first list used by the driver dashboard. A bus can be linked
 * to more than one historical assignment, but it should appear only once and
 * inactive assignments must never become trip-start choices.
 */
export function uniqueActiveAssignedBuses(
  assignments: DriverAssignmentSummary[],
): DriverAssignmentSummary[] {
  const buses = new Map<string, DriverAssignmentSummary>();

  for (const assignment of assignments) {
    if (assignment.status === 'active' && !buses.has(assignment.busId)) {
      buses.set(assignment.busId, assignment);
    }
  }

  return Array.from(buses.values());
}
