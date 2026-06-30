// SafeBus Alberta — gps-stale-check Edge Function
// Phase 5 (GPS Tracking)
//
// Cron job: runs every 15 seconds (via Supabase scheduled functions).
// Detects stale (>30s) and lost (>60s) GPS pings and emits alerts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 30 * 1000);
  const lostThreshold = new Date(now.getTime() - 60 * 1000);

  // Find active trips with stale GPS
  const { data: staleBuses } = await supabase
    .from('live_bus_locations')
    .select(`
      bus_id, trip_id, tenant_id, updated_at,
      bus:buses(bus_number),
      trip:trips(id, status)
    `)
    .lt('updated_at', staleThreshold.toISOString())
    .in('trip.status', ['active', 'delayed']);

  if (!staleBuses || staleBuses.length === 0) {
    return new Response('No stale buses', { status: 200 });
  }

  for (const bus of staleBuses) {
    const isLost = new Date(bus.updated_at) < lostThreshold;
    const alertType = isLost ? 'gps_lost' : 'gps_stale';
    const severity = isLost ? 'urgent' : 'warning';

    // Check if alert already exists
    const { data: existing } = await supabase
      .from('trip_alerts')
      .select('id')
      .eq('trip_id', bus.trip_id)
      .eq('alert_type', alertType)
      .eq('status', 'active')
      .single();

    if (existing) continue; // Already alerted

    // Emit alert
    await supabase.from('trip_alerts').insert({
      trip_id: bus.trip_id,
      tenant_id: bus.tenant_id,
      alert_type: alertType,
      severity,
      message: `GPS signal ${isLost ? 'lost' : 'stale'} for Bus ${bus.bus?.bus_number}`,
      status: 'active',
    });

    // Update trip status if lost
    if (isLost) {
      await supabase
        .from('trips')
        .update({ status: 'gps_lost' })
        .eq('id', bus.trip_id)
        .in('status', ['active', 'delayed', 'gps_stale']);
    } else {
      await supabase
        .from('trips')
        .update({ status: 'gps_stale' })
        .eq('id', bus.trip_id)
        .eq('status', 'active');
    }
  }

  return new Response(`Processed ${staleBuses.length} stale buses`, { status: 200 });
});
