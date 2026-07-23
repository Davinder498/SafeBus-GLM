import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
  DriverAssignmentSummary,
  DriverRouteAssignment,
} from '@/types/driverAssignments';
import type { DriverRecord } from '@/types/trips';
import { prepareDriverTripAssignments } from '@/utils/driverAssignments';
import { fetchCurrentDriver } from './driverTripService';
import { ensureBusRouteAssignment } from './studentBusAssignmentService';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const assignmentColumns =
  'id, tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id, bus_route_assignment_id, trip_type, status, effective_from, effective_to, created_at, updated_at';

function logDevError(context: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(context, error);
  }
}

// ---------------------------------------------------------------------------
// Admin-facing service functions
// ---------------------------------------------------------------------------

/**
 * Fetch all driver route assignments visible to the current admin (RLS-scoped
 * to their tenant). Returns the raw assignment rows; the admin page joins
 * driver/bus/route display names client-side.
 */
export async function fetchAdminAssignments(): Promise<DriverRouteAssignment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('driver_route_assignments')
    .select(assignmentColumns)
    .order('created_at', { ascending: false });

  if (error) {
    logDevError('Failed to load admin driver assignments', error);
    throw new Error('Unable to load driver assignments.');
  }
  return (data ?? []) as DriverRouteAssignment[];
}

/**
 * Create a new driver route assignment. The tenant_id is derived from the
 * admin's profile (passed via defaultTenantId), never trusted from the form
 * input.
 */
export async function createDriverAssignment(
  input: CreateAssignmentInput,
  defaultTenantId: string | null,
): Promise<DriverRouteAssignment> {
  const client = requireSupabase();

  if (!defaultTenantId) {
    throw new Error('Use an account with a tenant before saving this assignment.');
  }

  const busService = await ensureBusRouteAssignment({
    tenant_id: defaultTenantId,
    bus_id: input.busId,
    route_id: input.routeId,
    route_trip_pattern_id: input.tripPatternId,
    trip_type: input.tripType,
    status: 'active',
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
  });
  const { data, error } = await client
    .from('driver_route_assignments')
    .insert({
      tenant_id: defaultTenantId,
      driver_id: input.driverId,
      bus_id: input.busId,
      route_id: input.routeId,
      route_trip_pattern_id: input.tripPatternId,
      trip_type: input.tripType,
      status: input.status,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      bus_route_assignment_id: busService.id,
    })
    .select(assignmentColumns)
    .single();

  if (error) {
    logDevError('Failed to create driver assignment', error);
    if (error.code === '42P01') {
      throw new Error(
        'Driver assignments are not installed in this environment. Apply the required database migrations before assigning a driver.',
      );
    }
    if (
      error.code === '23505' ||
      error.message.includes('driver_route_assignments_active_unique')
    ) {
      throw new Error(
        'An active assignment for this driver, bus, route, and trip type already exists.',
      );
    }
    if (error.code === '23P01') {
      throw new Error('This named trip already has a driver assigned for the selected dates.');
    }
    if (error.code === '42501') {
      throw new Error('Your account is not authorized to assign this driver and bus to the route.');
    }
    if (error.code === '23514') {
      throw new Error(
        'The driver, bus, route, and trip type must all be active and valid for this organization.',
      );
    }
    throw new Error('We could not save the driver assignment. Please try again.');
  }

  return data as DriverRouteAssignment;
}

/**
 * Update an assignment's status (e.g., deactivate). Only status is updated
 * through this function to keep the surface narrow.
 */
export async function updateAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus,
): Promise<DriverRouteAssignment> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('driver_route_assignments')
    .update({ status })
    .eq('id', assignmentId)
    .select(assignmentColumns)
    .single();

  if (error) {
    logDevError('Failed to update driver assignment', error);
    throw new Error('We could not update the driver assignment. Please try again.');
  }

  return data as DriverRouteAssignment;
}

// ---------------------------------------------------------------------------
// Driver-facing service functions
// ---------------------------------------------------------------------------

interface DriverAssignmentRpcRow {
  assignment_id: string;
  bus_id: string;
  route_id: string;
  route_trip_pattern_id: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
  route_name: string;
  route_code: string;
  bus_number: string;
  scheduled_start_time: string | null;
}

/** Fetch the authenticated driver's exact, currently startable trip assignments. */
export async function fetchDriverAssignments(): Promise<DriverAssignmentSummary[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_current_driver_trip_assignments');

  if (error) {
    logDevError('Failed to load current driver trip assignments', error);
    throw new Error('We could not load your trip assignments. Please try again.');
  }

  return prepareDriverTripAssignments(
    ((data ?? []) as DriverAssignmentRpcRow[]).map((row) => ({
      id: row.assignment_id,
      busId: row.bus_id,
      routeId: row.route_id,
      tripPatternId: row.route_trip_pattern_id,
      tripName: row.trip_name,
      direction: row.direction,
      busLabel: row.bus_number,
      routeName: row.route_name,
      routeCode: row.route_code,
      scheduledStartTime: row.scheduled_start_time,
      status: 'active',
    })),
  );
}

/** Re-exported for the driver dashboard to avoid an extra import. */
export { fetchCurrentDriver, type DriverRecord };
