import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import { albertaToday } from '@/utils/adminTripDates';
import { busWorkspaceLifecycle } from '@/utils/busWorkspace';

function matchesService(service: BusServiceOption, assignment: DriverRouteAssignment): boolean {
  if (assignment.tenant_id !== service.tenant_id || assignment.bus_id !== service.bus_id ||
      assignment.route_id !== service.route_id) return false;
  if (assignment.bus_route_assignment_id) return assignment.bus_route_assignment_id === service.id;
  return assignment.route_trip_pattern_id === service.route_trip_pattern_id ||
    (!assignment.route_trip_pattern_id && assignment.trip_type === service.trip_type);
}

export function activeDriverForBusService(
  service: BusServiceOption,
  assignments: DriverRouteAssignment[],
  serviceDate = albertaToday(),
): DriverRouteAssignment | null {
  if (busWorkspaceLifecycle(service, serviceDate) !== 'current') return null;
  return assignments.filter((assignment) => matchesService(service, assignment) &&
    busWorkspaceLifecycle(assignment, serviceDate) === 'current')
    .sort((a, b) => Number(!!b.bus_route_assignment_id) - Number(!!a.bus_route_assignment_id) ||
      (b.effective_from ?? '').localeCompare(a.effective_from ?? '') || a.id.localeCompare(b.id))[0] ?? null;
}

/** Future coverage is presented separately and never counted as today's driver. */
export function scheduledDriverForBusService(
  service: BusServiceOption,
  assignments: DriverRouteAssignment[],
  serviceDate = albertaToday(),
): DriverRouteAssignment | null {
  if (service.status !== 'active') return null;
  return assignments.filter((assignment) => matchesService(service, assignment) &&
    busWorkspaceLifecycle(assignment, serviceDate) === 'upcoming' &&
    (!service.effective_to || assignment.effective_from! <= service.effective_to) &&
    (!assignment.effective_to || !service.effective_from || assignment.effective_to >= service.effective_from))
    .sort((a, b) => a.effective_from!.localeCompare(b.effective_from!) ||
      Number(!!b.bus_route_assignment_id) - Number(!!a.bus_route_assignment_id) || a.id.localeCompare(b.id))[0] ?? null;
}
