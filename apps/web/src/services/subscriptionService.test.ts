import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchTenantPrices } from './subscriptionService';

vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'synthetic-session' } } }),
    },
  },
}));

const request = vi.fn();
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal('fetch', request);
});
afterEach(() => vi.unstubAllGlobals());
const monthly = {
  id: 'price_month',
  name: 'SafeBus',
  currency: 'cad',
  unitAmount: 199,
  interval: 'month',
};
it.each([
  null,
  {},
  { prices: null },
  { prices: [null] },
  { prices: [{ ...monthly, currency: 'usd' }] },
  { prices: [{ ...monthly, unitAmount: 1.5 }] },
])('rejects an invalid price response safely: %j', async (payload) => {
  request.mockResolvedValue({ ok: true, json: async () => payload });
  await expect(fetchTenantPrices()).rejects.toThrow('Subscription options could not be loaded');
});
it('distinguishes a valid empty catalog from an invalid response', async () => {
  request.mockResolvedValue({ ok: true, json: async () => ({ prices: [] }) });
  await expect(fetchTenantPrices()).resolves.toEqual([]);
});
it('accepts published CAD prices without changing their amounts', async () => {
  request.mockResolvedValue({ ok: true, json: async () => ({ prices: [monthly] }) });
  await expect(fetchTenantPrices()).resolves.toEqual([monthly]);
});
