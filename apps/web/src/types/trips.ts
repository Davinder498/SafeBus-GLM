// Driver trip operations types for Milestone 4A.
// Field names mirror the public.driver_trips table columns (snake_case).

export type TripType = 'morning' | 'evening';
export type TripStatus = 'active' | 'completed' | 'cancelled';

export interface DriverTrip {
  id: string;
  tenant_id: string;
  driver_id: string;
  bus_id: string;
  route_id: string;
  trip_type: TripType;
  status: TripStatus;
  service_date: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transportation context the driver needs to start a trip:
 * their own driver record plus the active buses and routes visible to them in
 * their tenant (scoped by RLS).
 */
export interface DriverTripContext {
  driver: DriverRecord | null;
  buses: BusSummary[];
  routes: RouteSummary[];
}

export interface DriverRecord {
  id: string;
  tenant_id: string;
  profile_id: string;
  employee_number: string | null;
  phone: string | null;
  status: string;
}

export interface BusSummary {
  id: string;
  bus_number: string;
  license_plate: string | null;
  capacity: number | null;
  status: string;
}

export interface RouteSummary {
  id: string;
  route_name: string;
  route_code: string;
  route_type: string;
  status: string;
}

/** Input the client provides when starting a trip. tenant_id and driver_id are
 * derived server-side from the authenticated driver record, never trusted from
 * the client. */
export interface StartTripInput {
  busId: string;
  routeId: string;
  tripType: TripType;
}
