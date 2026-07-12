import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverTrip } from '@/types/trips';

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export interface AdminSetupSnapshot {
  buses: number;
  drivers: number;
  routes: number;
  stops: number;
  students: number;
  guardians: number;
  guardianLinks: number;
  studentAssignments: number;
  driverAssignments: number;
}

export async function fetchAdminSetupSnapshot(): Promise<AdminSetupSnapshot> {
  const client = requireSupabase();
  const tables = [
    'buses', 'drivers', 'routes', 'route_stops', 'students', 'guardians',
    'student_guardians', 'student_route_assignments', 'driver_route_assignments',
  ] as const;
  const results = await Promise.all(
    tables.map((table) => client.from(table).select('id', { count: 'exact', head: true }).eq('status', 'active')),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error('Unable to check transportation setup.');
  const counts = results.map((result) => result.count ?? 0);
  return {
    buses: counts[0], drivers: counts[1], routes: counts[2], stops: counts[3],
    students: counts[4], guardians: counts[5], guardianLinks: counts[6],
    studentAssignments: counts[7], driverAssignments: counts[8],
  };
}

const tripColumns = 'id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at, ended_at, created_at, updated_at';

export async function fetchAdminTrips(): Promise<DriverTrip[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('driver_trips').select(tripColumns).order('started_at', { ascending: false }).limit(25);
  if (error) throw new Error('Unable to load trips.');
  return (data ?? []) as DriverTrip[];
}
