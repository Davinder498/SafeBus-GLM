import { supabase } from '@/lib/supabase';
import type { PendingTripAction } from './pendingDriverTripAction';

type Outcome = 'applied' | 'confirmed' | 'obsolete' | 'review';
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
/** No legacy fallback: retries require the atomic own-trip revision check. */
export async function applyQueuedTripStop(item: PendingTripAction): Promise<Outcome> {
  if (!supabase) throw new Error('Trip synchronization is unavailable.');
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)(
    'apply_driver_trip_stop_action',
    {
      p_trip_id: item.tripId,
      p_action: item.action,
      p_expected_updated_at: item.expectedUpdatedAt,
      p_reason: item.reason,
    },
  );
  if (error || !['applied', 'confirmed', 'obsolete', 'review'].includes(data as string))
    throw new Error('The saved trip action could not be confirmed.');
  return data as Outcome;
}
