/**
 * SafeBus Alberta — GPS location submission.
 *
 * Sends pings to the `ingest-location` Edge Function.
 * Includes offline queue support for the driver app.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocationPingRequest, LocationPingResponse } from '@safebus/types';
import { locationPingSchema } from './validation.ts';
import { NetworkError, ValidationError, toSafeBusError } from './errors.ts';

/**
 * Submit a single GPS ping to the ingest-location Edge Function.
 * Throws NetworkError if offline — caller should enqueue for retry.
 */
export async function submitLocationPing(
  supabase: SupabaseClient,
  ping: LocationPingRequest,
): Promise<LocationPingResponse> {
  const parsed = locationPingSchema.safeParse(ping);
  if (!parsed.success) {
    throw new ValidationError('Invalid location ping', parsed.error.flatten().fieldErrors as never);
  }

  const { data, error } = await supabase.functions.invoke<LocationPingResponse>(
    'ingest-location',
    { body: parsed.data },
  );

  if (error) {
    // Supabase functions.invoke throws on network errors
    if (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network')) {
      throw new NetworkError(error.message, error);
    }
    throw toSafeBusError(error);
  }

  return data as LocationPingResponse;
}

/**
 * Submit multiple queued pings (offline flush).
 * Returns the count of accepted vs rejected pings.
 */
export async function flushLocationQueue(
  supabase: SupabaseClient,
  pings: LocationPingRequest[],
): Promise<{ accepted: number; rejected: number }> {
  let accepted = 0;
  let rejected = 0;

  // Send sequentially to respect rate limits (10 pings/sec/driver max).
  // A batch endpoint can be added later for efficiency.
  for (const ping of pings) {
    try {
      const response = await submitLocationPing(supabase, ping);
      if (response.accepted) accepted++;
      else rejected++;
    } catch {
      rejected++;
    }
  }

  return { accepted, rejected };
}
