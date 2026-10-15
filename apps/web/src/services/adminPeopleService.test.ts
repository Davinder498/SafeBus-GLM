import { beforeEach, expect, it, vi } from 'vitest';
import { revokeDriverTrackingDevices } from './adminPeopleService';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc }, supabaseConfigError: null }));
beforeEach(() => vi.clearAllMocks());
it.each([0, 3])('accepts a confirmed device-revocation count', async (count) => {
  mocks.rpc.mockResolvedValue({ data: count, error: null });
  expect(await revokeDriverTrackingDevices('driver')).toBe(count);
});
it.each([null, {}, '3', -1, 0.5])(
  'does not report a malformed revocation response as success',
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(revokeDriverTrackingDevices('driver')).rejects.toThrow(
      'Could not confirm device revocation.',
    );
  },
);
