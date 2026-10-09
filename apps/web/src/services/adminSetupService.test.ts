import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminSetupSnapshot } from '@/services/adminSetupService';

const { from, eq } = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from }, supabaseConfigError: null }));

describe('transportation summary counts', () => {
  beforeEach(() => {
    from.mockReset();
    eq.mockReset();
    from.mockReturnValue({ select: () => ({ eq }) });
  });

  it('accepts genuine zero counts', async () => {
    eq.mockResolvedValue({ count: 0, error: null });
    expect(await fetchAdminSetupSnapshot()).toMatchObject({ buses: 0, routes: 0, guardians: 0 });
  });

  it('does not convert failed or missing counts into zero', async () => {
    for (const result of [
      { count: null, error: null },
      { count: null, error: { message: 'Denied' } },
    ]) {
      eq.mockResolvedValue({ count: 3, error: null });
      eq.mockResolvedValueOnce(result);
      await expect(fetchAdminSetupSnapshot()).rejects.toThrow('transportation summary');
    }
  });
});
