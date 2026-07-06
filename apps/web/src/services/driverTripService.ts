import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  DriverRecord,
  DriverTrip,
  TripType,
} from '@/types/trips';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const driverColumns = 'id, tenant_id, profile_id, employee_number, phone, status';
const tripColumns =
  'id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at, ended_at, created_at, updated_at';

/**
 * Fetch the current driver's own driver record. Returns null if the signed-in
 * user has no active driver row (RLS "drivers select own" scopes this to the
 * authenticated user's own record).
 */
export async function fetchCurrentDriver(): Promise<DriverRecord | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('drivers')
    .select(driverColumns)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as DriverRecord | null) ?? null;
}

/**
 * Fetch the driver's current active trip, if any. Scoped by RLS to the
 * authenticated driver's own trips in their tenant.
 */
export async function fetchActiveDriverTrip(): Promise<DriverTrip | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('driver_trips')
    .select(tripColumns)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as DriverTrip | null) ?? null;
}

/**
 * End the current driver's active trip.
 *
 * This calls the end_driver_trip() Postgres RPC (security definer). The RPC is
 * the ONLY path that can mutate a driver_trips row: there is no UPDATE policy
 * and no UPDATE grant on the table. The RPC enforces, server-side, that the
 * caller is a driver, the trip belongs to the caller, the trip is in the
 * caller's tenant, and the trip is active. It sets ONLY status='completed' and
 * ended_at=now(); it never accepts or mutates tenant_id, driver_id, bus_id,
 * route_id, trip_type, service_date, started_at, or created_at.
 *
 * The client passes only the trip id — there is no parameter surface through
 * which other columns could be altered.
 */
export async function endDriverTrip(tripId: string): Promise<DriverTrip> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('end_driver_trip', { p_trip_id: tripId });

  if (error) {
    const message = error.message ?? 'Could not end the trip.';
    if (message.includes('not active')) {
      throw new Error('This trip is no longer active. Refresh your dashboard.');
    }
    if (message.includes('not found') || message.includes('Only a driver')) {
      throw new Error('Could not end the trip. It may belong to another driver.');
    }
    throw new Error(message);
  }

  return data as DriverTrip;
}

export type { TripType };

/**
 * Start a trip from a driver route assignment via the secure
 * start_driver_trip_from_assignment() RPC. The RPC is SECURITY DEFINER and
 * enforces: caller is a driver, the assignment belongs to the caller's tenant,
 * the assignment belongs to the caller, and the assignment is active. It
 * derives tenant/driver/bus/route/trip_type from the assignment row — the
 * client passes only the assignment id. Preserves the one-active-trip-per-
 * driver and one-active-trip-per-bus invariants.
 *
 * Raw backend errors are logged in DEV only; a generic safe error is thrown.
 */
export async function startTripFromAssignment(assignmentId: string): Promise<DriverTrip> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('start_driver_trip_from_assignment', {
    p_assignment_id: assignmentId,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to start trip from assignment', error);
    }
    const message = error.message ?? 'Could not start the trip.';
    if (message.includes('already have an active trip')) {
      throw new Error('You already have an active trip. End it before starting a new one.');
    }
    if (message.includes('bus already has an active trip')) {
      throw new Error('This bus already has an active trip. End the existing trip or choose a different assignment.');
    }
    if (message.includes('not active')) {
      throw new Error('This assignment is no longer active. Refresh your dashboard.');
    }
    if (message.includes('not found') || message.includes('Only a driver')) {
      throw new Error('We could not start this trip. Please try again or contact your transportation admin.');
    }
    throw new Error('We could not start this trip. Please try again or contact your transportation admin.');
  }

  return data as DriverTrip;
}
