import { supabase, supabaseConfigError } from '@/lib/supabase';

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
    'buses',
    'drivers',
    'routes',
    'route_stops',
    'students',
    'guardians',
    'student_guardians',
    'student_bus_assignments',
    'driver_route_assignments',
  ] as const;
  const results = await Promise.all(
    tables.map((table) =>
      client.from(table).select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ),
  );
  const failed = results.find(
    (result) =>
      result.error ||
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0,
  );
  if (failed) throw new Error('Unable to load the transportation summary.');
  const counts = results.map((result) => result.count!);
  return {
    buses: counts[0],
    drivers: counts[1],
    routes: counts[2],
    stops: counts[3],
    students: counts[4],
    guardians: counts[5],
    guardianLinks: counts[6],
    studentAssignments: counts[7],
    driverAssignments: counts[8],
  };
}
