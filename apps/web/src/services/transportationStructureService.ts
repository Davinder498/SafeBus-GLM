import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Bus, Driver, Route, RouteStop, StudentRouteAssignment } from '@/types/transportation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
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

export async function getVisibleDrivers(): Promise<Driver[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('drivers')
    .select('id, tenant_id, profile_id, employee_number, phone, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Driver[];
}

export async function getVisibleRoutes(): Promise<Route[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('routes')
    .select(
      'id, tenant_id, school_id, route_name, route_code, route_type, status, created_at, updated_at',
    )
    .order('route_code', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Route[];
}

export async function getVisibleRouteStops(): Promise<RouteStop[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_stops')
    .select(
      'id, tenant_id, route_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at',
    )
    .order('stop_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteStop[];
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
