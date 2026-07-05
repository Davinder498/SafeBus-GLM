import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  BusSummary,
  DriverRecord,
  DriverTrip,
  DriverTripContext,
  RouteSummary,
  StartTripInput,
  TripType,
} from '@/types/trips';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const driverColumns = 'id, tenant_id, profile_id, employee_number, phone, status';
const busColumns = 'id, bus_number, license_plate, capacity, status';
const routeColumns = 'id, route_name, route_code, route_type, status';
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
 * Fetch the driver's transportation context: their driver record plus the
 * active buses and routes visible to them in their tenant (RLS-scoped).
 */
export async function fetchDriverTripContext(): Promise<DriverTripContext> {
  const client = requireSupabase();

  const [driverResult, busesResult, routesResult] = await Promise.all([
    client.from('drivers').select(driverColumns).eq('status', 'active').limit(1).maybeSingle(),
    client
      .from('buses')
      .select(busColumns)
      .eq('status', 'active')
      .order('bus_number', { ascending: true }),
    client
      .from('routes')
      .select(routeColumns)
      .eq('status', 'active')
      .order('route_code', { ascending: true }),
  ]);

  if (driverResult.error) throw new Error(driverResult.error.message);
  if (busesResult.error) throw new Error(busesResult.error.message);
  if (routesResult.error) throw new Error(routesResult.error.message);

  return {
    driver: (driverResult.data as DriverRecord | null) ?? null,
    buses: (busesResult.data ?? []) as BusSummary[],
    routes: (routesResult.data ?? []) as RouteSummary[],
  };
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
 * Start a new active trip for the current driver.
 *
 * tenant_id and driver_id are derived from the authenticated driver's own
 * record (fetched here), never from the client input. RLS re-enforces this on
 * insert. The partial unique indexes on driver_trips guarantee at most one
 * active trip per driver and per bus.
 */
export async function startDriverTrip(input: StartTripInput): Promise<DriverTrip> {
  const client = requireSupabase();

  const driver = await fetchCurrentDriver();
  if (!driver) {
    throw new Error('Your driver profile is not set up. Ask an administrator to create your driver record.');
  }

  const { data, error } = await client
    .from('driver_trips')
    .insert({
      tenant_id: driver.tenant_id,
      driver_id: driver.id,
      bus_id: input.busId,
      route_id: input.routeId,
      trip_type: input.tripType,
      status: 'active',
      service_date: new Date().toISOString().slice(0, 10),
      started_at: new Date().toISOString(),
    })
    .select(tripColumns)
    .single();

  if (error) {
    // Friendly messages for the two uniqueness violations we enforce.
    if (error.message.includes('driver_trips_driver_active_unique')) {
      throw new Error('You already have an active trip. End it before starting a new one.');
    }
    if (error.message.includes('driver_trips_bus_active_unique')) {
      throw new Error('This bus already has an active trip. Choose a different bus or end the existing trip.');
    }
    throw new Error(error.message);
  }

  return data as DriverTrip;
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
