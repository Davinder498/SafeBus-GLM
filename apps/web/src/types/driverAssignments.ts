// Admin-facing driver assignment types. Driver assignments support scheduling
// and operational planning; they are not a driver trip-start mechanism.

import type { TripType } from './trips';

export type AssignmentStatus = 'active' | 'inactive';

export interface DriverRouteAssignment {
  id: string;
  tenant_id: string;
  driver_id: string;
  bus_id: string;
  route_id: string;
  route_trip_pattern_id: string | null;
  bus_route_assignment_id?: string | null;
  trip_type: TripType;
  status: AssignmentStatus;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverRouteAssignmentWithDetails extends DriverRouteAssignment {
  driverName: string | null;
  driverEmail: string | null;
  busLabel: string | null;
  routeName: string | null;
}

/** The tenant is derived from the authenticated admin profile. */
export interface CreateAssignmentInput {
  driverId: string;
  busId: string;
  routeId: string;
  tripPatternId: string;
  tripType: TripType;
  status: AssignmentStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type UpdateAssignmentInput = Partial<Omit<CreateAssignmentInput, 'driverId'>>;
