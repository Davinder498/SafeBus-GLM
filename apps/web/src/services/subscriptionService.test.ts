import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  changeTenantBilling,
  fetchTenantPrices,
  hasPendingTenantBilling,
  retryTenantBilling,
  queueInvoiceBilling,
  recoverPendingTenantBilling,
} from './subscriptionService';

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
  sessionStorage.clear();
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

it('fences invoice requests with card changes and retries the same invoice operation without browser-stored financial details', async () => {
  const tenant = 'authority-invoice-retry';
  const body = {
    endpoint: 'invoice-billing' as const,
    action: 'activate' as const,
    arrangementId: 'original-arrangement',
  };
  request.mockRejectedValueOnce(new TypeError('unconfirmed'));
  await expect(queueInvoiceBilling(tenant, body)).rejects.toThrow('was not confirmed');
  expect(request.mock.calls[0][0]).toBe('/.netlify/functions/invoice-billing');
  const original = JSON.parse(request.mock.calls[0][1].body);
  expect(original.arrangementId).toBe('original-arrangement');
  expect(original).not.toHaveProperty('endpoint');
  expect(sessionStorage.getItem('safebus-billing-request:' + tenant)).toBe(original.requestId);
  await expect(changeTenantBilling(tenant, 'checkout', 'price_month', 10)).rejects.toThrow(
    'previous billing request',
  );
  request.mockResolvedValueOnce(Response.json({ ok: true, status: 'activated' }));
  await retryTenantBilling(tenant);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(original);
  expect(hasPendingTenantBilling(tenant)).toBe(false);
});

it('recovers the original invoice endpoint and payload from the authenticated ledger after reload', async () => {
  const tenant = 'authority-invoice-recover';
  request.mockResolvedValueOnce(
    Response.json({
      pending: {
        requestId: 'saved-operation',
        body: { endpoint: 'invoice-billing', action: 'cancel_renewal' },
      },
    }),
  );
  expect(await recoverPendingTenantBilling(tenant)).toBe(true);
  request.mockResolvedValueOnce(Response.json({ ok: true }));
  await retryTenantBilling(tenant);
  expect(request.mock.calls[1][0]).toBe('/.netlify/functions/invoice-billing');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
    action: 'cancel_renewal',
    requestId: 'saved-operation',
  });
});
it.each([
  null,
  {},
  { prices: null },
  { prices: [null] },
  { prices: [{ ...monthly, currency: 'usd' }] },
  { prices: [{ ...monthly, unitAmount: 1.5 }] },
])('rejects an invalid price response safely: %j', async (payload) => {
  request.mockResolvedValue(Response.json(payload));
  await expect(fetchTenantPrices()).rejects.toThrow(/could not be loaded|was not confirmed/);
});
it('distinguishes a valid empty catalog from an invalid response', async () => {
  request.mockResolvedValue(Response.json({ prices: [] }));
  await expect(fetchTenantPrices()).resolves.toEqual([]);
});
it('accepts published CAD prices without changing their amounts', async () => {
  request.mockResolvedValue(Response.json({ prices: [monthly] }));
  await expect(fetchTenantPrices()).resolves.toEqual([monthly]);
});

it.each([
  ['HTML', '<html>SafeBus</html>', 'text/html'],
  ['truncated JSON', '{unfinished', 'application/json'],
  ['empty confirmation', '{}', 'application/json'],
  ['unrelated confirmation', '{"message":"OK"}', 'application/json'],
  ['negative acknowledgement', '{"ok":false}', 'application/json'],
])(
  'retains the cancellation request after %s and retries with the same identity',
  async (name, body, contentType) => {
    const tenantId = `authority-${name}`;
    request.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': contentType } }));
    await expect(changeTenantBilling(tenantId, 'cancel')).rejects.toThrow('was not confirmed');
    expect(hasPendingTenantBilling(tenantId)).toBe(true);
    const firstBody = JSON.parse(request.mock.calls[0][1].body);
    expect(sessionStorage.getItem(`safebus-billing-request:${tenantId}`)).toBe(firstBody.requestId);
    expect(request).toHaveBeenCalledTimes(1);

    request.mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(retryTenantBilling(tenantId)).resolves.toEqual({ ok: true });
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(firstBody);
    expect(hasPendingTenantBilling(tenantId)).toBe(false);
  },
);

it('keeps a plan change pending after network failure without exposing upstream details', async () => {
  request.mockRejectedValueOnce(new TypeError('private upstream URL failed'));
  await expect(
    changeTenantBilling('authority-network', 'change', 'price_month', 3),
  ).rejects.toThrow('was not confirmed');
  expect(hasPendingTenantBilling('authority-network')).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(Response.json({ ok: true, pendingPayment: true }));
  await retryTenantBilling('authority-network');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(
    JSON.parse(request.mock.calls[0][1].body),
  );
});

it('preserves a non-retryable rejection and releases its saved request', async () => {
  request.mockResolvedValueOnce(
    Response.json({ error: 'This change is not permitted.', retryable: false }, { status: 409 }),
  );
  await expect(changeTenantBilling('authority-rejected', 'cancel')).rejects.toThrow(
    'This change is not permitted.',
  );
  expect(hasPendingTenantBilling('authority-rejected')).toBe(false);
});

it('does not confirm checkout without its URL', async () => {
  request.mockResolvedValueOnce(Response.json({ ok: true }));
  await expect(
    changeTenantBilling('authority-checkout', 'checkout', 'price_month', 3),
  ).rejects.toThrow('was not confirmed');
  expect(hasPendingTenantBilling('authority-checkout')).toBe(true);
  request.mockResolvedValueOnce(Response.json({ url: 'https://checkout.stripe.com/synthetic' }));
  await expect(retryTenantBilling('authority-checkout')).resolves.toEqual({
    url: 'https://checkout.stripe.com/synthetic',
  });
  expect(hasPendingTenantBilling('authority-checkout')).toBe(false);
});
