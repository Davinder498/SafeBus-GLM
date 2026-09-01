import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
  DriverRouteAssignment,
  PlannedDriverAssignment,
  SetPlannedDriverAssignmentInput,
} from '@/types/driverAssignments';
import { ensureBusRouteAssignment } from './studentBusAssignmentService';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const assignmentColumns =
  'id, tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id, bus_route_assignment_id, trip_type, status, effective_from, effective_to, created_at, updated_at';

const plannedAssignmentColumns = `${assignmentColumns},
  bus:buses!driver_route_assignments_bus_id_fkey(bus_number, license_plate),
  route:routes!driver_route_assignments_route_id_fkey(route_name, route_code),
  trip_pattern:route_trip_patterns!driver_route_assignments_route_trip_pattern_id_fkey(display_name, direction)`;
const ownPlannedAssignmentColumns = `${assignmentColumns},
  bus:buses!driver_route_assignments_bus_id_fkey(bus_number),
  route:routes!driver_route_assignments_route_id_fkey(route_name, route_code),
  trip_pattern:route_trip_patterns!driver_route_assignments_route_trip_pattern_id_fkey(display_name, direction)`;

interface PlannedAssignmentRow extends DriverRouteAssignment {
  bus: { bus_number: string; license_plate?: string | null } | null;
  route: { route_name: string; route_code: string } | null;
  trip_pattern: {
    display_name: string;
    direction: 'forward' | 'reverse';
  } | null;
}

function mapPlannedAssignment(row: PlannedAssignmentRow): PlannedDriverAssignment {
  return {
    ...row,
    bus_number: row.bus?.bus_number ?? 'Unknown bus',
    license_plate: row.bus?.license_plate ?? null,
    route_name: row.route?.route_name ?? 'Unknown route',
    route_code: row.route?.route_code ?? 'Route',
    trip_name: row.trip_pattern?.display_name ?? 'Route trip',
    direction: row.trip_pattern?.direction ?? (row.trip_type === 'evening' ? 'reverse' : 'forward'),
  };
}

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

export async function fetchAdminPlannedDriverAssignments(
  driverId: string,
): Promise<PlannedDriverAssignment[]> {
  const { data, error } = await requireSupabase()
    .from('driver_route_assignments')
    .select(plannedAssignmentColumns)
    .eq('driver_id', driverId)
    .order('effective_from', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    logDevError('Failed to load planned assignments for driver', error);
    throw new Error('Unable to load planned bus assignments.');
  }
  return ((data ?? []) as unknown as PlannedAssignmentRow[]).map(mapPlannedAssignment);
}

/**
 * Driver-only read. RLS limits the base rows to current_driver_id(); the UI
 * intentionally requests no driver id and never receives administrative
 * history.
 */
export async function fetchOwnPlannedDriverAssignments(): Promise<PlannedDriverAssignment[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await requireSupabase()
    .from('driver_route_assignments')
    .select(ownPlannedAssignmentColumns)
    .eq('status', 'active')
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order('effective_from', { ascending: true, nullsFirst: true });

  if (error) {
    logDevError('Failed to load own planned assignments', error);
    throw new Error('Unable to load your planned assignments.');
  }
  return ((data ?? []) as unknown as PlannedAssignmentRow[]).map(mapPlannedAssignment);
}

export async function setPlannedDriverAssignment(
  input: SetPlannedDriverAssignmentInput,
): Promise<DriverRouteAssignment> {
  const { data, error } = await requireSupabase().rpc('admin_set_driver_bus_assignment', {
    p_driver_id: input.driverId,
    p_bus_route_assignment_id: input.busRouteAssignmentId,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo,
    p_existing_assignment_id: input.existingAssignmentId ?? null,
  });

  if (!error) return data as unknown as DriverRouteAssignment;
  logDevError('Failed to save planned driver assignment', error);
  if (error.code === '42501') {
    throw new Error('Only a tenant administrator can change planned assignments.');
  }
  if (error.code === 'P0002') {
    throw new Error(error.message || 'The selected driver or bus service is no longer available.');
  }
  if (error.code === '23P01' || error.code === '23505') {
    throw new Error('That route direction already has a planned driver for those dates.');
  }
  if (error.code === '22007' || error.code === '23514' || error.code === '55006') {
    throw new Error(error.message || 'The planned assignment could not be saved.');
  }
  throw new Error('Unable to save the planned bus assignment.');
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
  return setPlannedDriverAssignment({
    driverId: input.driverId,
    busRouteAssignmentId: busService.id,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
  });
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
