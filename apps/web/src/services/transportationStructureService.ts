import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  Bus,
  CreateBusInput,
  CreateDriverInput,
  CreateRouteInput,
  CreateRouteStopInput,
  CreateStudentRouteAssignmentInput,
  Driver,
  Route,
  RouteOverlay,
  RouteStop,
  RouteTripPattern,
  RouteTripStopSchedule,
  SaveRouteDefinitionInput,
  SaveRouteDefinitionResult,
  StudentRouteAssignment,
  UpdateBusInput,
  UpdateDriverInput,
  UpdateRouteInput,
  UpdateRouteStopInput,
  UpdateStudentRouteAssignmentInput,
} from '@/types/transportation';

export type DuplicateField = 'licensePlate' | 'licenseNumber' | 'email' | 'phone';

export class DuplicateIdentifierError extends Error {
  field: DuplicateField;

  constructor(field: DuplicateField, message: string) {
    super(message);
    this.name = 'DuplicateIdentifierError';
    this.field = field;
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}


function describeBusError(error: { message?: string; code?: string }): Error {
  const message = error?.message ?? '';
  if (
    message.includes('buses_tenant_license_plate_unique_idx') ||
    (message.includes('duplicate key value violates unique constraint') && message.includes('license_plate'))
  ) {
    return new DuplicateIdentifierError(
      'licensePlate',
      'A bus with this licence plate number already exists. Select the existing bus instead or enter a different plate number.',
    );
  }
  if (message.includes('buses_tenant_bus_number_unique')) {
    return new Error('A bus with this bus number already exists. Use a different bus number.');
  }
  return new Error('We could not save the bus. Check the bus details and try again.');
}

export async function getVisibleBuses(): Promise<Bus[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('buses')
    .select(
      'id, tenant_id, school_id, bus_number, license_plate, capacity, status, created_at, updated_at',
    )
    .order('bus_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Bus[];
}

export async function createBus(input: CreateBusInput): Promise<Bus> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('buses')
    .insert(input)
    .select('id, tenant_id, school_id, bus_number, license_plate, capacity, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to create bus', error);
    throw describeBusError(error);
  }
  return data as Bus;
}

export async function updateBus(id: string, input: UpdateBusInput): Promise<Bus> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('buses')
    .update(input)
    .eq('id', id)
    .select('id, tenant_id, school_id, bus_number, license_plate, capacity, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to update bus', error);
    throw describeBusError(error);
  }
  return data as Bus;
}

export async function deleteBus(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('buses').delete().eq('id', id);

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to delete bus', error);
    throw new Error('We could not delete the bus. Please try again.');
  }
}

export async function getVisibleDrivers(): Promise<Driver[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('drivers')
    .select('id, tenant_id, profile_id, employee_number, phone, license_number, license_issue_date, license_expiry_date, license_class, address_line1, address_line2, city, province, postal_code, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Driver[];
}

export async function createDriver(input: CreateDriverInput): Promise<Driver> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('drivers')
    .insert(input)
    .select('id, tenant_id, profile_id, employee_number, phone, license_number, license_issue_date, license_expiry_date, license_class, address_line1, address_line2, city, province, postal_code, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to create driver', error);
    if (error.message.includes('drivers_tenant_license_number_unique_idx')) {
      throw new DuplicateIdentifierError('licenseNumber', 'A driver with this driving licence number already exists. Select the existing driver instead.');
    }
    if (error.message.includes('drivers_tenant_phone_unique_idx')) {
      throw new DuplicateIdentifierError('phone', 'A driver with this phone number already exists. Use a different phone number or select the existing driver.');
    }
    throw new Error('We could not save the driver. Check the licence and address details and try again.');
  }
  return data as Driver;
}

export async function updateDriver(id: string, input: UpdateDriverInput): Promise<Driver> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('drivers')
    .update(input)
    .eq('id', id)
    .select('id, tenant_id, profile_id, employee_number, phone, license_number, license_issue_date, license_expiry_date, license_class, address_line1, address_line2, city, province, postal_code, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to update driver', error);
    if (error.message.includes('drivers_tenant_license_number_unique_idx')) {
      throw new DuplicateIdentifierError('licenseNumber', 'A driver with this driving licence number already exists. Select the existing driver instead.');
    }
    if (error.message.includes('drivers_tenant_phone_unique_idx')) {
      throw new DuplicateIdentifierError('phone', 'A driver with this phone number already exists. Use a different phone number or select the existing driver.');
    }
    throw new Error('We could not update the driver. Check the licence and address details and try again.');
  }
  return data as Driver;
}

export async function deleteDriver(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('drivers').delete().eq('id', id);

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to delete driver', error);
    throw new Error('We could not delete the driver record. Please try again.');
  }
}

export async function getVisibleRoutes(): Promise<Route[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('routes')
    .select(
      'id, tenant_id, school_id, route_name, route_code, route_type, route_kind, map_color, definition_status, status, created_at, updated_at',
    )
    .order('route_code', { ascending: true });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load routes', error);
    }
    throw new Error(
      error.message || 'Unable to load routes. Please try again.',
    );
  }
  return (data ?? []) as Route[];
}

/**
 * Translate a Supabase/Postgres error for a route write into a clear,
 * user-facing message. The most common cause of write failures is the
 * per-tenant unique constraint on route_code.
 */
function describeRouteError(error: { message?: string; code?: string }): Error {
  const message = error?.message ?? '';
  const isDuplicateRouteCode =
    message.includes('routes_tenant_route_code_unique') ||
    (message.includes('duplicate key value violates unique constraint') &&
      message.includes('route'));
  if (isDuplicateRouteCode) {
    return new Error(
      'A route with this code already exists in your organization. Use a different route code.',
    );
  }
  return new Error(message || 'Unable to save route.');
}

export async function createRoute(input: CreateRouteInput): Promise<Route> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('routes')
    .insert(input)
    .select('id, tenant_id, school_id, route_name, route_code, route_type, route_kind, map_color, definition_status, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to create route', error);
    throw describeRouteError(error);
  }
  return data as Route;
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<Route> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('routes')
    .update(input)
    .eq('id', id)
    .select('id, tenant_id, school_id, route_name, route_code, route_type, route_kind, map_color, definition_status, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to update route', error);
    throw describeRouteError(error);
  }
  return data as Route;
}

export async function deleteRoute(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('routes').delete().eq('id', id);

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to delete route', error);
    throw new Error('We could not delete the route. Please try again.');
  }
}

export async function getVisibleRouteStops(): Promise<RouteStop[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_stops')
    .select(
      'id, tenant_id, route_id, school_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at',
    )
    .order('stop_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteStop[];
}

export async function getVisibleRouteTripPatterns(): Promise<RouteTripPattern[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_trip_patterns')
    .select(
      'id, tenant_id, route_id, direction, display_name, status, schedule_review_required, created_at, updated_at',
    )
    .order('direction', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteTripPattern[];
}

export async function getVisibleRouteTripStopSchedules(): Promise<RouteTripStopSchedule[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_trip_stop_schedules')
    .select(
      'id, tenant_id, route_id, route_trip_pattern_id, route_stop_id, planned_arrival_time, created_at, updated_at',
    );

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteTripStopSchedule[];
}

export async function saveRouteDefinition(
  input: SaveRouteDefinitionInput,
): Promise<SaveRouteDefinitionResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('admin_save_route_definition', {
    p_route: input.route,
    p_stops: input.stops,
    p_trip_patterns: input.tripPatterns,
  });

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to save route definition', error);
    throw describeRouteError(error);
  }
  return data as SaveRouteDefinitionResult;
}

export async function getAdminLiveRouteOverlays(): Promise<RouteOverlay[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_admin_live_route_overlays');
  if (error) throw new Error(error.message);
  return (data ?? []) as RouteOverlay[];
}

export async function getGuardianLiveRouteOverlays(): Promise<RouteOverlay[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_guardian_live_route_overlays');
  if (error) throw new Error(error.message);
  return (data ?? []) as RouteOverlay[];
}

export async function createRouteStop(input: CreateRouteStopInput): Promise<RouteStop> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_stops')
    .insert(input)
    .select('id, tenant_id, route_id, school_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as RouteStop;
}

export async function updateRouteStop(
  id: string,
  input: UpdateRouteStopInput,
): Promise<RouteStop> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_stops')
    .update(input)
    .eq('id', id)
    .select('id, tenant_id, route_id, school_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as RouteStop;
}

export async function getVisibleStudentRouteAssignments(): Promise<StudentRouteAssignment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('student_route_assignments')
    .select(
      'id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, effective_from, effective_to, status, created_at, updated_at',
    )
    .order('effective_from', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudentRouteAssignment[];
}

export async function createStudentRouteAssignment(
  input: CreateStudentRouteAssignmentInput,
): Promise<StudentRouteAssignment> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('student_route_assignments')
    .insert(input)
    .select('id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, effective_from, effective_to, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to create student route assignment', error);
    throw new Error('We could not save this assignment. Confirm the student, route, and stops are active and belong to your organization.');
  }
  return data as StudentRouteAssignment;
}

export async function updateStudentRouteAssignment(
  id: string,
  input: UpdateStudentRouteAssignmentInput,
): Promise<StudentRouteAssignment> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('student_route_assignments')
    .update(input)
    .eq('id', id)
    .select('id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, effective_from, effective_to, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to update student route assignment', error);
    throw new Error('We could not update this assignment. Confirm the student, route, and stops are active and belong to your organization.');
  }
  return data as StudentRouteAssignment;
}
