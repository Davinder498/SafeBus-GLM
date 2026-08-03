import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverTrip } from '@/types/trips';
import { mapBusQrStartError } from '@/utils/busQr';

export interface BusTrackingStartResult {
  trip: DriverTrip;
  trackingToken: string;
  busNumber: string;
  resumed: boolean;
}

export interface BusQrStartOption {
  busRouteAssignmentId: string;
  busNumber: string;
  routeCode: string;
  routeName: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  resumed: boolean;
}

interface BusQrStartOptionRow {
  bus_route_assignment_id: string;
  bus_number: string;
  route_code: string;
  route_name: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
  resumed: boolean;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function getBusQrStartOptions(rawToken: string): Promise<BusQrStartOption[]> {
  const { data, error } = await client().rpc('get_bus_qr_start_options', {
    p_qr_token: rawToken.trim(),
  });
  if (error) throw new Error(mapBusQrStartError(error.message ?? 'Bus QR lookup failed.'));
  return ((data ?? []) as BusQrStartOptionRow[]).map((row) => ({
    busRouteAssignmentId: row.bus_route_assignment_id,
    busNumber: row.bus_number,
    routeCode: row.route_code,
    routeName: row.route_name,
    tripName: row.trip_name,
    direction: row.direction,
    resumed: row.resumed,
  }));
}

export async function startBusTrackingFromQr(
  rawToken: string,
  busRouteAssignmentId: string,
): Promise<BusTrackingStartResult> {
  const { data, error } = await client().rpc('start_bus_tracking_from_qr', {
    p_qr_token: rawToken.trim(),
    p_bus_route_assignment_id: busRouteAssignmentId,
  });
  if (error) throw new Error(mapBusQrStartError(error.message ?? 'Bus QR start failed.'));
  const result = data as unknown as BusTrackingStartResult;
  if (!result?.trip?.id || !result.trackingToken || !result.busNumber) {
    throw new Error('The bus tracking session could not be started.');
  }
  return result;
}
