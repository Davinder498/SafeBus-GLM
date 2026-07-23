// Driver route assignment types for Milestone 4F.
// Field names mirror the public.driver_route_assignments table columns.

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

/**
 * Assignment enriched with driver/bus/route display names for admin lists.
 * The admin page joins these client-side from the separately loaded
 * drivers/buses/routes.
 */
export interface DriverRouteAssignmentWithDetails extends DriverRouteAssignment {
  driverName: string | null;
  driverEmail: string | null;
  busLabel: string | null;
  routeName: string | null;
}

/** Input the client provides when creating an assignment. tenant_id is derived
 * server-side from the admin's tenant, never trusted from the client. */
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

/**
 * Driver-facing assignment summary — the driver dashboard shows these instead
 * of raw bus/route dropdowns.
 */
export interface DriverAssignmentSummary {
  id: string;
  busId: string;
  routeId: string;
  tripPatternId: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  busLabel: string;
  routeName: string;
  routeCode: string;
  scheduledStartTime: string | null;
  status: AssignmentStatus;
}
