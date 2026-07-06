import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
  DriverAssignmentSummary,
  DriverRouteAssignment,
} from '@/types/driverAssignments';
import type { DriverRecord, TripType } from '@/types/trips';
import { fetchCurrentDriver } from './driverTripService';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const assignmentColumns =
  'id, tenant_id, driver_id, bus_id, route_id, trip_type, status, effective_from, effective_to, created_at, updated_at';

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

  const { data, error } = await client
    .from('driver_route_assignments')
    .insert({
      tenant_id: defaultTenantId,
      driver_id: input.driverId,
      bus_id: input.busId,
      route_id: input.routeId,
      trip_type: input.tripType,
      status: input.status,
    })
    .select(assignmentColumns)
    .single();

  if (error) {
    logDevError('Failed to create driver assignment', error);
    if (error.message.includes('driver_route_assignments_active_unique')) {
      throw new Error('An active assignment for this driver, bus, route, and trip type already exists.');
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

/**
 * Fetch the current driver's active assignments, enriched with bus/route
 * display names for the dashboard. Scoped by RLS to the driver's own
 * assignments in their tenant.
 *
 * Fetches assignments, buses, and routes in parallel (all RLS-scoped to the
 * driver's tenant) and joins bus_number/route_name client-side to avoid
 * PostgREST nested-select typing complexity.
 */
export async function fetchDriverAssignments(): Promise<DriverAssignmentSummary[]> {
  const client = requireSupabase();

  const [assignmentsResult, busesResult, routesResult] = await Promise.all([
    client
      .from('driver_route_assignments')
      .select(assignmentColumns)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    client
      .from('buses')
      .select('id, bus_number')
      .eq('status', 'active'),
    client
      .from('routes')
      .select('id, route_name')
      .eq('status', 'active'),
  ]);

  if (assignmentsResult.error) {
    logDevError('Failed to load driver assignments', assignmentsResult.error);
    throw new Error('We could not load your trip assignments. Please try again.');
  }
  // Buses/routes errors are non-fatal — we just won't have display labels.
  const busMap = new Map<string, string>(
    ((busesResult.data ?? []) as Array<{ id: string; bus_number: string }>).map((b) => [b.id, b.bus_number]),
  );
  const routeMap = new Map<string, string>(
    ((routesResult.data ?? []) as Array<{ id: string; route_name: string }>).map((r) => [r.id, r.route_name]),
  );

  const rows = (assignmentsResult.data ?? []) as DriverRouteAssignment[];
  return rows.map((row) => ({
    id: row.id,
    busId: row.bus_id,
    routeId: row.route_id,
    busLabel: busMap.get(row.bus_id) ?? null,
    routeName: routeMap.get(row.route_id) ?? null,
    tripType: row.trip_type as TripType,
    status: row.status as AssignmentStatus,
  }));
}

/** Re-exported for the driver dashboard to avoid an extra import. */
export { fetchCurrentDriver, type DriverRecord };
