/**
 * SafeBus Alberta — Trip helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Trip, TripWithRelations } from '@safebus/types';
import { toSafeBusError } from './errors.ts';

export async function getDriverTrips(
  supabase: SupabaseClient,
  driverId: string,
  tripDate?: string,
): Promise<Trip[]> {
  let query = supabase
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .order('scheduled_start', { ascending: true });

  if (tripDate) {
    query = query.eq('trip_date', tripDate);
  }

  const { data, error } = await query;
  if (error) throw toSafeBusError(error);
  return (data ?? []) as Trip[];
}

export async function getTripWithRelations(
  supabase: SupabaseClient,
  tripId: string,
): Promise<TripWithRelations | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `
      *,
      route:routes(*),
      bus:buses(*),
      driver:drivers(*, profile:profiles(*)),
      school:routes(school:schools(*))
    `,
    )
    .eq('id', tripId)
    .single();

  if (error) throw toSafeBusError(error);
  return data as TripWithRelations | null;
}

export async function startTrip(
  supabase: SupabaseClient,
  tripId: string,
  driverId: string,
): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'active',
      actual_start: new Date().toISOString(),
    })
    .eq('id', tripId)
    .eq('driver_id', driverId)
    .in('status', ['scheduled', 'delayed'])
    .select()
    .single();

  if (error) throw toSafeBusError(error);
  return data as Trip;
}

export async function endTrip(
  supabase: SupabaseClient,
  tripId: string,
  driverId: string,
): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'completed',
      actual_end: new Date().toISOString(),
    })
    .eq('id', tripId)
    .eq('driver_id', driverId)
    .in('status', ['active', 'delayed', 'gps_stale', 'gps_lost'])
    .select()
    .single();

  if (error) throw toSafeBusError(error);
  return data as Trip;
}
