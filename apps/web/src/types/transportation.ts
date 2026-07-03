export type BusStatus = 'active' | 'maintenance' | 'inactive' | 'retired';
export type DriverStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type RouteStatus = 'active' | 'inactive' | 'archived';
export type RouteType = 'morning' | 'afternoon' | 'special' | 'field_trip';
export type RouteStopStatus = 'active' | 'inactive' | 'archived';
export type StudentRouteAssignmentStatus = 'active' | 'inactive' | 'archived';

export interface Bus {
  id: string;
  tenant_id: string;
  school_id: string | null;
  bus_number: string;
  license_plate: string | null;
  capacity: number | null;
  status: BusStatus;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  tenant_id: string;
  profile_id: string;
  employee_number: string | null;
  phone: string | null;
  status: DriverStatus;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: string;
  tenant_id: string;
  school_id: string;
  route_name: string;
  route_code: string;
  route_type: RouteType;
  status: RouteStatus;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  tenant_id: string;
  route_id: string;
  stop_name: string;
  stop_order: number;
  planned_arrival_time: string | null;
  latitude: number | null;
  longitude: number | null;
  status: RouteStopStatus;
  created_at: string;
  updated_at: string;
}

export interface StudentRouteAssignment {
  id: string;
  tenant_id: string;
  student_id: string;
  route_id: string;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  effective_from: string;
  effective_to: string | null;
  status: StudentRouteAssignmentStatus;
  created_at: string;
  updated_at: string;
}
