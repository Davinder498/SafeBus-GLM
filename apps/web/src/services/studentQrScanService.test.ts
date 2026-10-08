import { beforeEach, expect, it, vi } from 'vitest';
import { recordStudentQrEvent } from './studentQrScanService';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc }, supabaseConfigError: null }));
beforeEach(() => vi.clearAllMocks());
it('sends the selected event and displayed trip in one authenticated RPC', async () => {
  mocks.rpc.mockResolvedValue({
    data: [
      {
        student_id: 's',
        student_display_name: 'Avery J.',
        pickup_stop_name: 'Elm',
        dropoff_stop_name: 'School',
        student_trip_status: 'picked_up',
        outcome: 'already_recorded',
      },
    ],
    error: null,
  });
  const result = await recordStudentQrEvent('opaque-token', 'picked_up', 'displayed-trip');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('record_student_qr_event_for_active_trip', {
    p_qr_token: 'opaque-token',
    p_event_type: 'picked_up',
    p_driver_trip_id: 'displayed-trip',
  });
  expect(result.outcome).toBe('already_recorded');
});
it.each([
  { data: null, error: { message: 'sensitive internal error' } },
  { data: [], error: null },
])(
  'does not display raw backend errors or treat an empty response as success',
  async (response) => {
    mocks.rpc.mockResolvedValue(response);
    await expect(recordStudentQrEvent('token', 'dropped_off', 'trip')).rejects.toThrow(
      'Could not confirm this scan. Retry the same event.',
    );
  },
);
