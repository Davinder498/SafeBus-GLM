export type BusStatus = 'active' | 'maintenance' | 'inactive' | 'retired';
export type DriverStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type RouteStatus = 'active' | 'inactive' | 'archived';
export type RouteType = 'morning' | 'afternoon' | 'special' | 'field_trip';
export type RouteKind = 'regular' | 'field_trip';
export type RouteDefinitionStatus = 'incomplete' | 'ready';
export type RouteDirection = 'forward' | 'reverse';
export type RouteTripPatternStatus = 'active' | 'inactive';
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
  license_number: string | null;
  license_issue_date: string | null;
  license_expiry_date: string | null;
  license_class: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
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
  route_kind: RouteKind;
  map_color: string;
  definition_status: RouteDefinitionStatus;
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

export interface RouteTripPattern {
  id: string;
  tenant_id: string;
  route_id: string;
  direction: RouteDirection;
  display_name: string;
  status: RouteTripPatternStatus;
  schedule_review_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteTripStopSchedule {
  id: string;
  tenant_id: string;
  route_id: string;
  route_trip_pattern_id: string;
  route_stop_id: string;
  planned_arrival_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteDefinitionStopInput {
  id?: string;
  clientKey: string;
  schoolId: string | null;
  stopName: string;
  stopOrder: number;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'inactive';
}

export interface RouteDefinitionTripInput {
  id?: string;
  direction: RouteDirection;
  displayName: string;
  status: RouteTripPatternStatus;
  stopTimes: Record<string, string | null>;
}

export interface SaveRouteDefinitionInput {
  route: {
    id?: string;
    schoolId: string | null;
    routeName: string;
    routeCode: string;
    routeKind: RouteKind;
    mapColor: string;
    status: RouteStatus;
  };
  stops: RouteDefinitionStopInput[];
  tripPatterns: RouteDefinitionTripInput[];
}

export interface SaveRouteDefinitionResult {
  routeId: string;
  definitionStatus: RouteDefinitionStatus;
  activeStopCount: number;
}

export interface RouteOverlayStop {
  id?: string;
  name: string;
  order: number;
  latitude: number;
  longitude: number;
  plannedArrivalTime: string | null;
}

export interface RouteShapeGeoJson {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteOverlay {
  studentId?: string;
  routeId?: string;
  routeCode: string;
  routeName: string;
  routeKind?: RouteKind;
  mapColor: string;
  tripPatternId?: string;
  tripName: string;
  direction: RouteDirection;
  stops: RouteOverlayStop[];
  routeShapeGeojson?: RouteShapeGeoJson | null;
  routeShapeVersion?: number | null;
  routeShapeDistanceMeters?: number | null;
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
  route_trip_pattern_id: string | null;
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
  route_trip_pattern_id: string | null;
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
  license_number: string | null;
  license_issue_date: string | null;
  license_expiry_date: string | null;
  license_class: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
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
