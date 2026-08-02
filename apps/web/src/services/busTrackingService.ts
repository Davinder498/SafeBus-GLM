import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverTrip } from '@/types/trips';
import { mapBusQrStartError } from '@/utils/busQr';

export interface BusTrackingStartResult {
  trip: DriverTrip;
  trackingToken: string;
  busNumber: string;
  resumed: boolean;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function startBusTrackingFromQr(rawToken: string): Promise<BusTrackingStartResult> {
  const { data, error } = await client().rpc('start_bus_tracking_from_qr', {
    p_qr_token: rawToken.trim(),
  });
  if (error) throw new Error(mapBusQrStartError(error.message ?? 'Bus QR start failed.'));
  const result = data as unknown as BusTrackingStartResult;
  if (!result?.trip?.id || !result.trackingToken || !result.busNumber) {
    throw new Error('The bus tracking session could not be started.');
  }
  return result;
}
