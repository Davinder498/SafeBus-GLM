import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';

export function activeDriverForBusService(
  service: BusServiceOption,
  assignments: DriverRouteAssignment[],
): DriverRouteAssignment | null {
  return (
    assignments.find(
      (assignment) =>
        assignment.status === 'active' && assignment.bus_route_assignment_id === service.id,
    ) ??
    assignments.find(
      (assignment) =>
        assignment.status === 'active' &&
        assignment.bus_id === service.bus_id &&
        assignment.route_id === service.route_id &&
        (assignment.route_trip_pattern_id === service.route_trip_pattern_id ||
          (!assignment.route_trip_pattern_id && assignment.trip_type === service.trip_type)),
    ) ??
    null
  );
}
