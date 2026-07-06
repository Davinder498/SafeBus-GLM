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
