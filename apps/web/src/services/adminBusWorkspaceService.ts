import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { Bus, BusRouteAssignment, StudentBusAssignment } from '@/types/transportation';

export interface AdminBusWorkspaceBus extends Bus {
  school_name: string | null;
}

export interface AdminBusRouteAssignment extends BusRouteAssignment {
  route_name: string;
  route_code: string;
  route_status: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
  has_active_trip: boolean;
}

export interface AdminBusDriverAssignment extends DriverRouteAssignment {
  driver_name: string;
  driver_email: string;
  has_active_trip: boolean;
}

export interface AdminBusStudentAssignment extends StudentBusAssignment {
  student_name: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
}

export interface AdminBusWorkspace {
  bus: AdminBusWorkspaceBus;
  routeAssignments: AdminBusRouteAssignment[];
  driverAssignments: AdminBusDriverAssignment[];
  studentAssignments: AdminBusStudentAssignment[];
  readyDispatch: AdminBusReadyDispatch | null;
}

export interface AdminBusReadyDispatch {
  dispatch_id: string;
  bus_id: string;
  bus_route_assignment_id: string;
  service_date: string;
  status: 'ready';
  route_name: string;
  route_code: string;
  trip_name: string;
  prepared_at: string;
}

export interface ReplaceBusTripDriverInput {
  busRouteAssignmentId: string;
  driverId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function fetchAdminBusWorkspace(busId: string): Promise<AdminBusWorkspace> {
  const [workspaceResult, dispatchResult] = await Promise.all([
    client().rpc('get_admin_bus_workspace', { p_bus_id: busId }),
    client().rpc('get_admin_bus_ready_dispatch', { p_bus_id: busId }),
  ]);
  const { data, error } = workspaceResult;
  if (error) {
    if (error.code === 'P0002') throw new Error('This bus is not available.');
    throw new Error('Unable to load the bus workspace.');
  }
  if (dispatchResult.error) throw new Error('Unable to load this bus ready run.');
  const readyDispatch = ((dispatchResult.data ?? []) as AdminBusReadyDispatch[])[0] ?? null;
  return { ...(data as unknown as Omit<AdminBusWorkspace, 'readyDispatch'>), readyDispatch };
}

export async function prepareBusRun(busRouteAssignmentId: string): Promise<void> {
  const { error } = await client().rpc('prepare_bus_run', {
    p_bus_route_assignment_id: busRouteAssignmentId,
  });
  if (error) {
    if (error.code === '55006')
      throw new Error(error.message || 'This run cannot be prepared now.');
    throw new Error('Unable to prepare this bus run.');
  }
}

export async function endBusRouteAssignment(busRouteAssignmentId: string): Promise<void> {
  const { error } = await client().rpc('admin_end_bus_route_assignment', {
    p_bus_route_assignment_id: busRouteAssignmentId,
  });
  if (error) {
    if (error.code === '55006') {
      throw new Error('End the active trip before ending this route assignment.');
    }
    throw new Error('Unable to end this bus route assignment.');
  }
}

export async function replaceBusTripDriver(input: ReplaceBusTripDriverInput): Promise<void> {
  const { error } = await client().rpc('admin_replace_bus_trip_driver', {
    p_bus_route_assignment_id: input.busRouteAssignmentId,
    p_driver_id: input.driverId,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo,
  });
  if (error) {
    if (error.code === '55006') {
      throw new Error('End the active trip before changing this driver.');
    }
    if (error.code === '23P01' || error.code === '23505') {
      throw new Error('That driver assignment overlaps an existing scheduled assignment.');
    }
    throw new Error('Unable to save this driver assignment.');
  }
}
