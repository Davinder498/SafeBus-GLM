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
  ])(
    'stops before privileged profile/billing work on an inactive or unverifiable session',
    async (result, status) => {
      const user = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } }, error: null }),
        },
        rpc: vi.fn().mockResolvedValue(result),
      };
      const admin = { from: vi.fn(), rpc: vi.fn() };
      createClient.mockReturnValueOnce(user).mockReturnValueOnce(admin);
      const response = await requireBillingCaller(
        { headers: { authorization: 'Bearer test-jwt' } },
        ['tenant_admin'],
      );
      expect(response.error.statusCode).toBe(status);
      expect(admin.from).not.toHaveBeenCalled();
      expect(admin.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'sensitive billing uses current-token proof (recent=%s), not another device sign-in',
    async (recent) => {
      const profile = {
        id: 'caller',
        tenant_id: 'authority',
        role: 'tenant_admin',
        status: 'active',
      };
      const user = {
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({
              data: { user: { id: 'caller', last_sign_in_at: new Date().toISOString() } },
              error: null,
            }),
          mfa: {
            getAuthenticatorAssuranceLevel: vi
              .fn()
              .mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null }),
          },
          getClaims: vi
            .fn()
            .mockResolvedValue({
              data: {
                claims: {
                  sub: 'caller',
                  role: 'authenticated',
                  session_id: '11111111-1111-4111-8111-111111111111',
                  amr: [
                    {
                      method: 'password',
                      timestamp: Math.floor(Date.now() / 1000) - (recent ? 60 : 3600),
                    },
                  ],
                },
              },
              error: null,
            }),
        },
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      };
      const lookup = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
      };
      const admin = { from: vi.fn().mockReturnValue(lookup) };
      createClient.mockReturnValueOnce(user).mockReturnValueOnce(admin);
      const result = await requireBillingCaller(
        { headers: { authorization: 'Bearer current-token' } },
        ['tenant_admin'],
        { recentAuth: true },
      );
      expect(user.auth.getClaims).toHaveBeenCalledWith('current-token');
      if (recent) expect(result.caller).toEqual(profile);
      else {
        expect(result.error.statusCode).toBe(403);
        expect(user.rpc).toHaveBeenCalledTimes(1);
      }
    },
  );
});
