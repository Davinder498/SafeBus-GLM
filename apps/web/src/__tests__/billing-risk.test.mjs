import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  clean: (v) => (typeof v === 'string' ? v.trim() : ''),
  createServerClients: vi.fn(),
  createStripeClient: vi.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
  retrieveCanonicalSubscription: vi.fn(),
  syncSubscriptionProjection: vi.fn(),
  safeProviderErrorCode: () => 'billing_provider_error',
  serverConfig: () => ({ stripeWebhookSecret: 'fixture' }),
}));
const shared = await import('../../netlify/functions/billing-shared.mjs');
const { handler } = await import('../../netlify/functions/stripe-webhook.mjs');
const { BILLING_RISK_EVENTS, sendBillingRiskAlert } =
  await import('../../netlify/functions/billing-risk-alert.mjs');
const env = {
  CONTEXT: 'production',
  SAFEBUS_EMAIL_PROVIDER_API_KEY: 'fixture',
  SAFEBUS_EMAIL_FROM: 'ops@example.test',
};
let event, rpc, fetchImpl, stripe;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, v));
  event = {
    id: 'evt_fixture',
    type: 'charge.dispute.created',
    livemode: true,
    created: 1800000000,
    data: {
      object: {
        id: 'dp_fixture',
        email: 'private@example.test',
        metadata: { safebus_tenant_id: 'untrusted' },
      },
    },
  };
  rpc = vi.fn(async (name) => ({
    data: name === 'billing_begin_webhook_event' ? true : null,
    error: null,
  }));
  shared.createServerClients.mockReturnValue({ admin: { rpc } });
  stripe = { webhooks: { constructEvent: vi.fn(() => event) } };
  shared.createStripeClient.mockReturnValue(stripe);
  fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'email_fixture' }) }));
  vi.stubGlobal('fetch', fetchImpl);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
const request = {
  httpMethod: 'POST',
  body: 'signed fixture',
  headers: { 'stripe-signature': 'fixture' },
};
describe('manual billing risk review', () => {
  it.each([...BILLING_RISK_EVENTS])(
    '%s alerts without changing subscription or access',
    async (type) => {
      event.type = type;
      expect((await handler(request)).statusCode).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'billing_begin_webhook_event',
        'billing_complete_webhook_event',
      ]);
      expect(shared.syncSubscriptionProjection).not.toHaveBeenCalled();
      expect(shared.retrieveCanonicalSubscription).not.toHaveBeenCalled();
      const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
      expect(payload.to).toEqual(['info@safebus.kids']);
      expect(payload.text).toContain('evt_fixture');
      expect(payload.text).not.toContain('private@example.test');
      expect(payload.text).not.toContain('untrusted');
    },
  );
  it('rejects invalid signatures before recording or sending', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('invalid');
    });
    expect((await handler(request)).statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('skips completed duplicate events', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await handler(request)).statusCode).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('returns retryable failure when receipt or completion fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'database unavailable' } });
    expect((await handler(request)).statusCode).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();
    rpc.mockImplementation(async (name) =>
      name === 'billing_begin_webhook_event'
        ? { data: true }
        : { error: { message: 'unavailable' } },
    );
    expect((await handler(request)).statusCode).toBe(500);
  });
  it('retries provider failure and preserves stable payload/key', async () => {
    fetchImpl.mockResolvedValueOnce({ ok: false });
    expect((await handler(request)).statusCode).toBe(500);
    expect(rpc).toHaveBeenCalledWith(
      'billing_complete_webhook_event',
      expect.objectContaining({ p_status: 'failed' }),
    );
    expect((await handler(request)).statusCode).toBe(200);
    expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body);
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      fetchImpl.mock.calls[1][1].headers['Idempotency-Key'],
    );
  });
  it('refuses preview delivery, invalid identifiers and missing credentials', async () => {
    for (const options of [
      { env: { ...env, CONTEXT: 'deploy-preview' } },
      { env: { ...env, SAFEBUS_EMAIL_PROVIDER_API_KEY: '' } },
    ]) {
      await expect(sendBillingRiskAlert(event, { ...options, fetchImpl })).rejects.toThrow();
    }
    await expect(
      sendBillingRiskAlert({ ...event, id: 'evt_x\nInjected' }, { env, fetchImpl }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not treat empty provider acceptance as success', async () => {
    fetchImpl.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect((await handler(request)).statusCode).toBe(500);
  });
});
