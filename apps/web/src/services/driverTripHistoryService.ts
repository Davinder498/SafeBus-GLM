import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { DriverCompletedTripHistoryItem } from '@/types/driverTripHistory';

interface DriverCompletedTripHistoryRpcRow {
  driver_trip_id: string;
  service_date: string;
  started_at: string;
  ended_at: string;
  route_name: string;
  route_code: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
  bus_number: string;
}

export async function fetchDriverCompletedTripHistory(
  limit = 50,
): Promise<DriverCompletedTripHistoryItem[]> {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  const { data, error } = await supabase.rpc('get_driver_completed_trip_history', {
    p_limit: limit,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load driver completed trip history', error);
    }
    throw new Error('We could not load your completed trips. Please try again.');
  }

  return ((data ?? []) as DriverCompletedTripHistoryRpcRow[]).map((row) => ({
    id: row.driver_trip_id,
    serviceDate: row.service_date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    routeName: row.route_name,
    routeCode: row.route_code,
    tripName: row.trip_name,
    direction: row.direction,
    busNumber: row.bus_number,
  }));
}
