import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const { createClient } = await import('@supabase/supabase-js');
const { requireBillingCaller } = await import('../../netlify/functions/billing-shared.mjs');

describe('billing caller session boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-public-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
  });

  it.each([
    [{ data: false, error: null }, 401],
    [{ data: null, error: { message: 'offline' } }, 503],
  ])('stops before privileged profile/billing work on an inactive or unverifiable session', async (result, status) => {
    const user = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } }, error: null }) },
      rpc: vi.fn().mockResolvedValue(result),
    };
    const admin = { from: vi.fn(), rpc: vi.fn() };
    createClient.mockReturnValueOnce(user).mockReturnValueOnce(admin);
    const response = await requireBillingCaller({ headers: { authorization: 'Bearer test-jwt' } }, ['tenant_admin']);
    expect(response.error.statusCode).toBe(status);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
