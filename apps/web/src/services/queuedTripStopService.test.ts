import { beforeEach, expect, it, vi } from 'vitest';
import { applyQueuedTripStop } from './queuedTripStopService';
import type { PendingTripAction } from './pendingDriverTripAction';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const item = {
  tripId: 'original-trip',
  action: 'end',
  expectedUpdatedAt: '2026-11-03T14:00:00Z',
  reason: null,
} as PendingTripAction;
beforeEach(() => rpc.mockReset());
it('uses the original trip revision through the atomic endpoint', async () => {
  rpc.mockResolvedValue({ data: 'applied', error: null });
  expect(await applyQueuedTripStop(item)).toBe('applied');
  expect(rpc).toHaveBeenCalledWith('apply_driver_trip_stop_action', {
    p_trip_id: 'original-trip',
    p_action: 'end',
    p_expected_updated_at: item.expectedUpdatedAt,
    p_reason: null,
  });
});
it('retains review and obsolete outcomes without inventing confirmation', async () => {
  for (const data of ['review', 'obsolete']) {
    rpc.mockResolvedValue({ data, error: null });
    expect(await applyQueuedTripStop(item)).toBe(data);
  }
});
it('never falls back to a non-atomic action when the endpoint is unavailable', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private detail' } });
  await expect(applyQueuedTripStop(item)).rejects.toThrow('could not be confirmed');
  expect(rpc).toHaveBeenCalledOnce();
});
