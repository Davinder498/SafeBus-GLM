import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  BusRouteAssignment,
  CreateBusRouteAssignmentInput,
  CreateStudentBusAssignmentInput,
  StudentBusAssignment,
  UpdateStudentBusAssignmentInput,
} from '@/types/transportation';

export interface BusServiceOption extends BusRouteAssignment {
  bus_number: string;
  route_name: string;
  route_code: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function fetchAdminBusServices(): Promise<BusServiceOption[]> {
  const { data, error } = await client().rpc('get_admin_bus_services');
  if (error) throw new Error('Unable to load bus services.');
  return (data ?? []) as BusServiceOption[];
}

export async function ensureBusRouteAssignment(input: CreateBusRouteAssignmentInput): Promise<BusRouteAssignment> {
  const existing = await client().from('bus_route_assignments').select('*')
    .eq('tenant_id', input.tenant_id).eq('bus_id', input.bus_id).eq('route_id', input.route_id)
    .eq('route_trip_pattern_id', input.route_trip_pattern_id).eq('status', 'active').maybeSingle();
  if (existing.error) throw new Error('Unable to check the bus route service.');
  if (existing.data) return existing.data as BusRouteAssignment;
  const created = await client().from('bus_route_assignments').insert(input).select('*').single();
  if (created.error) {
    if (created.error.code === '23P01') {
      throw new Error('This named trip already has a bus assigned for the selected dates.');
    }
    if (created.error.code === '23514') {
      throw new Error('Bus assignment requires an active bus and a map-ready route with a reviewed trip.');
    }
    throw new Error('Unable to assign this bus to the route.');
  }
  return created.data as BusRouteAssignment;
}

export async function createStudentBusAssignment(input: CreateStudentBusAssignmentInput): Promise<StudentBusAssignment> {
  const { data, error } = await client().from('student_bus_assignments').insert(input).select('*').single();
  if (error) throw new Error('Unable to assign this student to the bus service. Check the selected stops.');
  return data as StudentBusAssignment;
}

export async function updateStudentBusAssignment(id: string, input: UpdateStudentBusAssignmentInput): Promise<StudentBusAssignment> {
  const { data, error } = await client().from('student_bus_assignments').update(input).eq('id', id).select('*').single();
  if (error) throw new Error('Unable to update this student bus assignment.');
  return data as StudentBusAssignment;
}
