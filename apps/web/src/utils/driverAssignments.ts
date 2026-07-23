import type { DriverAssignmentSummary } from '@/types/driverAssignments';

/**
 * Keeps every active trip assignment, including multiple trips on the same
 * bus, and applies the dashboard's deterministic schedule-first ordering.
 */
export function prepareDriverTripAssignments(
  assignments: DriverAssignmentSummary[],
): DriverAssignmentSummary[] {
  return assignments
    .filter((assignment) => assignment.status === 'active')
    .sort((left, right) => {
      if (left.scheduledStartTime && !right.scheduledStartTime) return -1;
      if (!left.scheduledStartTime && right.scheduledStartTime) return 1;
      if (left.scheduledStartTime && right.scheduledStartTime) {
        const timeOrder = left.scheduledStartTime.localeCompare(right.scheduledStartTime);
        if (timeOrder !== 0) return timeOrder;
      }

      const tripOrder = left.tripName.localeCompare(right.tripName);
      if (tripOrder !== 0) return tripOrder;
      const busOrder = left.busLabel.localeCompare(right.busLabel, undefined, { numeric: true });
      if (busOrder !== 0) return busOrder;
      return left.id.localeCompare(right.id);
    });
}
