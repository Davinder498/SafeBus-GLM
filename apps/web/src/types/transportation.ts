export type BusStatus = 'active' | 'maintenance' | 'inactive' | 'retired';
export type DriverStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type RouteStatus = 'active' | 'inactive' | 'archived';
export type RouteType = 'morning' | 'afternoon' | 'special' | 'field_trip';
export type RouteStopStatus = 'active' | 'inactive' | 'archived';
export type StudentRouteAssignmentStatus = 'active' | 'inactive' | 'archived';
export type StudentBusAssignmentStatus = StudentRouteAssignmentStatus;

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
  school_id: string | null;
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
  school_id: string | null;
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

export interface BusRouteAssignment {
  id: string;
  tenant_id: string;
  bus_id: string;
  route_id: string;
  trip_type: 'morning' | 'evening';
  effective_from: string | null;
  effective_to: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface StudentBusAssignment {
  id: string;
  tenant_id: string;
  student_id: string;
  bus_route_assignment_id: string;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  effective_from: string;
  effective_to: string | null;
  status: StudentBusAssignmentStatus;
  created_at: string;
  updated_at: string;
}

export type CreateBusInput = {
  tenant_id: string;
  school_id: string | null;
  bus_number: string;
  license_plate: string | null;
  capacity: number | null;
  status: BusStatus;
};

export type UpdateBusInput = Partial<Omit<CreateBusInput, 'tenant_id'>>;

export type CreateDriverInput = {
  tenant_id: string;
  profile_id: string;
  employee_number: string | null;
  phone: string | null;
  status: DriverStatus;
};

export type UpdateDriverInput = Partial<Omit<CreateDriverInput, 'tenant_id'>>;

export type CreateRouteInput = {
  tenant_id: string;
  school_id: string | null;
  route_name: string;
  route_code: string;
  route_type: RouteType;
  status: RouteStatus;
};

export type UpdateRouteInput = Partial<Omit<CreateRouteInput, 'tenant_id'>>;

export type CreateRouteStopInput = {
  tenant_id: string;
  route_id: string;
  school_id?: string | null;
  stop_name: string;
  stop_order: number;
  planned_arrival_time: string | null;
  latitude: number | null;
  longitude: number | null;
  status: RouteStopStatus;
};

export type UpdateRouteStopInput = Partial<Omit<CreateRouteStopInput, 'tenant_id'>>;

export type CreateStudentRouteAssignmentInput = {
  tenant_id: string;
  student_id: string;
  route_id: string;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  effective_from: string;
  effective_to: string | null;
  status: StudentRouteAssignmentStatus;
};

export type UpdateStudentRouteAssignmentInput = Partial<
  Omit<CreateStudentRouteAssignmentInput, 'tenant_id'>
>;

export type CreateBusRouteAssignmentInput = Omit<BusRouteAssignment, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBusRouteAssignmentInput = Partial<Omit<CreateBusRouteAssignmentInput, 'tenant_id'>>;
export type CreateStudentBusAssignmentInput = Omit<StudentBusAssignment, 'id' | 'created_at' | 'updated_at'>;
export type UpdateStudentBusAssignmentInput = Partial<Omit<CreateStudentBusAssignmentInput, 'tenant_id'>>;
