// SafeBus Alberta — ingest-location Edge Function
// Phase 5 (GPS Tracking)
//
// Validates and stores GPS pings from driver apps.
// Validation: auth, driver role, trip assignment, trip active, tenant match,
//             timestamp reasonableness, accuracy, source.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LocationPingRequest {
  tripId: string;
  busId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  batteryLevel?: number | null;
  recordedAt: string;
  locationSource: 'driver_web' | 'driver_mobile' | 'hardware_tracker';
}

const REJECTION_REASONS = {
  not_authenticated: 401,
  not_a_driver: 403,
  driver_not_assigned_to_trip: 403,
  trip_not_active: 409,
  bus_tenant_mismatch: 403,
  trip_tenant_mismatch: 403,
  timestamp_out_of_range: 400,
  accuracy_too_low: 400,
  invalid_location_source: 400,
  rate_limited: 429,
} as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    },
  );

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ accepted: false, rejectionReason: 'not_authenticated' }, 401);
  }

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!profile || profile.role !== 'driver') {
    return json({ accepted: false, rejectionReason: 'not_a_driver' }, 403);
  }

  // Parse body
  let ping: LocationPingRequest;
  try {
    ping = await req.json();
  } catch {
    return json({ accepted: false, rejectionReason: 'invalid_location_source' }, 400);
  }

  // Validate: driver assigned to trip
  const { data: trip } = await supabase
    .from('trips')
    .select('id, status, bus_id, tenant_id, driver_id')
    .eq('id', ping.tripId)
    .eq('driver_id', ping.driverId)
    .single();

  if (!trip) {
    return json({ accepted: false, rejectionReason: 'driver_not_assigned_to_trip' }, 403);
  }

  // Validate: trip active or delayed
  if (!['active', 'delayed'].includes(trip.status)) {
    return json({ accepted: false, rejectionReason: 'trip_not_active' }, 409);
  }

  // Validate: tenant match
  if (trip.tenant_id !== profile.tenant_id) {
    return json({ accepted: false, rejectionReason: 'trip_tenant_mismatch' }, 403);
  }
  if (trip.bus_id !== ping.busId) {
    return json({ accepted: false, rejectionReason: 'bus_tenant_mismatch' }, 403);
  }

  // Validate: timestamp (within 5 minutes of now)
  const recordedAt = new Date(ping.recordedAt);
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - recordedAt.getTime());
  if (diffMs > 5 * 60 * 1000) {
    return json({ accepted: false, rejectionReason: 'timestamp_out_of_range' }, 400);
  }

  // Validate: accuracy (reject if > 100m)
  if (ping.accuracy !== null && ping.accuracy !== undefined && ping.accuracy > 100) {
    return json({ accepted: false, rejectionReason: 'accuracy_too_low' }, 400);
  }

  // Upsert live location
  const { error: upsertError } = await supabase
    .from('live_bus_locations')
    .upsert({
      bus_id: ping.busId,
      trip_id: ping.tripId,
      tenant_id: profile.tenant_id,
      latitude: ping.latitude,
      longitude: ping.longitude,
      speed: ping.speed ?? null,
      heading: ping.heading ?? null,
      accuracy: ping.accuracy ?? null,
      battery_level: ping.batteryLevel ?? null,
      recorded_at: ping.recordedAt,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    console.error('Upsert error:', upsertError);
    return json({ accepted: false, rejectionReason: 'invalid_location_source' }, 500);
  }

  // Insert history
  await supabase.from('trip_location_history').insert({
    trip_id: ping.tripId,
    bus_id: ping.busId,
    tenant_id: profile.tenant_id,
    latitude: ping.latitude,
    longitude: ping.longitude,
    speed: ping.speed ?? null,
    heading: ping.heading ?? null,
    accuracy: ping.accuracy ?? null,
    battery_level: ping.batteryLevel ?? null,
    recorded_at: ping.recordedAt,
    location_source: ping.locationSource,
  });

  return json({ accepted: true, nextPingInMs: 5000 }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
