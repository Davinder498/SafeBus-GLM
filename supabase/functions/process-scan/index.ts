// SafeBus Alberta — process-scan Edge Function
// Phase 7 (QR Scan)
//
// Validates QR badge scans and manual overrides.
// Records scan events and triggers parent notifications.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto as stdCrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

interface ScanRequest {
  qrToken?: string;
  tripId: string;
  driverId: string;
  timestamp: string;
  studentId?: string; // for manual override
  eventType?: 'pickup' | 'boarding' | 'dropoff';
  isManual?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  reason?: string;
}

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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ accepted: false, rejectionReason: 'not_authenticated' }, 401);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!profile || profile.role !== 'driver') {
    return json({ accepted: false, rejectionReason: 'not_authenticated' }, 403);
  }

  let body: ScanRequest;
  try {
    body = await req.json();
  } catch {
    return json({ accepted: false, rejectionReason: 'badge_not_found' }, 400);
  }

  // Validate: driver assigned to trip
  const { data: trip } = await supabase
    .from('trips')
    .select('id, status, route_id, tenant_id')
    .eq('id', body.tripId)
    .eq('driver_id', body.driverId)
    .single();

  if (!trip) {
    return json({ accepted: false, rejectionReason: 'driver_not_assigned_to_trip' }, 403);
  }

  if (trip.status !== 'active') {
    return json({ accepted: false, rejectionReason: 'trip_not_active' }, 409);
  }

  let studentId: string;
  let badgeId: string | null = null;

  if (body.isManual) {
    // Manual override
    if (!body.studentId || !body.eventType) {
      return json({ accepted: false, rejectionReason: 'badge_not_found' }, 400);
    }
    studentId = body.studentId;
  } else {
    // QR scan — hash token and lookup
    if (!body.qrToken) {
      return json({ accepted: false, rejectionReason: 'badge_not_found' }, 400);
    }

    const tokenHash = await hashToken(body.qrToken);
    const { data: badge } = await supabase
      .from('student_badges')
      .select('id, student_id, status')
      .eq('token_hash', tokenHash)
      .single();

    if (!badge) {
      return json({ accepted: false, rejectionReason: 'badge_not_found' }, 404);
    }
    if (badge.status === 'revoked') {
      return json({ accepted: false, rejectionReason: 'badge_revoked' }, 403);
    }
    if (badge.status !== 'active' && badge.status !== 'issued') {
      return json({ accepted: false, rejectionReason: 'badge_revoked' }, 403);
    }

    studentId = badge.student_id;
    badgeId = badge.id;
  }

  // Validate: student assigned to route
  const { data: assignment } = await supabase
    .from('student_route_assignments')
    .select('id')
    .eq('student_id', studentId)
    .eq('route_id', trip.route_id)
    .single();

  if (!assignment) {
    return json({ accepted: false, rejectionReason: 'student_not_assigned_to_route' }, 403);
  }

  // Determine event type
  const eventType = body.eventType || inferEventType(trip.route_id);

  // Check: not already scanned for this event
  const { data: existing } = await supabase
    .from('student_scan_events')
    .select('id')
    .eq('trip_id', body.tripId)
    .eq('student_id', studentId)
    .eq('event_type', eventType)
    .single();

  if (existing) {
    return json({ accepted: false, rejectionReason: 'already_scanned_for_event' }, 409);
  }

  // Get student name for display (redacted)
  const { data: student } = await supabase
    .from('students')
    .select('first_name, last_name')
    .eq('id', studentId)
    .single();

  const displayName = student
    ? `${student.first_name} ${student.last_name?.[0]?.toUpperCase()}.`
    : 'Student';

  // Record scan event
  const { error: insertError } = await supabase.from('student_scan_events').insert({
    trip_id: body.tripId,
    student_id: studentId,
    badge_id: badgeId,
    driver_id: body.driverId,
    event_type: eventType,
    is_manual: body.isManual ?? false,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    recorded_at: body.timestamp,
  });

  if (insertError) {
    console.error('Insert error:', insertError);
    return json({ accepted: false, rejectionReason: 'badge_not_found' }, 500);
  }

  // TODO: trigger dispatch-notification Edge Function

  return json({
    accepted: true,
    eventType,
    studentDisplayName: displayName,
  }, 200);
});

async function hashToken(token: string): Promise<string> {
  const hashBuffer = await stdCrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function inferEventType(routeId: string): 'pickup' | 'boarding' | 'dropoff' {
  // Simplified: AM route = pickup, PM route = dropoff
  // Real implementation queries route direction
  void routeId;
  return 'pickup';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
