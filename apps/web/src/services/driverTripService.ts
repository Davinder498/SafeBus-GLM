import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverTrip } from '@/types/trips';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

async function broadcastTripChanged(tenantId: string | null): Promise<void> {
  const client = supabase;
  if (!client || !tenantId) return;
  try {
    await client.channel(`safebus:tenant:${tenantId}`, { config: { private: true } }).send({
      type: 'broadcast',
      event: 'tracking_changed',
      payload: { changedAt: new Date().toISOString() },
    });
  } catch {
    // Realtime invalidation is best-effort; secured polling remains authoritative.
  }
}

const tripColumns =
  'id, tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id, driver_route_assignment_id, bus_number_snapshot, trip_name_snapshot, trip_type, status, service_date, started_at, ended_at, created_at, updated_at';

/** Fetch the authenticated driver's current active trip, if any. */
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
 * End the authenticated driver's own active trip. Starting a new trip is
 * intentionally absent from this service: the only browser start path is the
 * QR/session contract in busTrackingService.
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

  const trip = data as DriverTrip;
  await broadcastTripChanged(trip.tenant_id);
  return trip;
}
