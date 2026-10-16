import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  UUID_PATTERN: /^[0-9a-f-]{36}$/,
  clean: (v) => (typeof v === 'string' ? v.trim() : ''),
  createStripeClient: vi.fn(),
  getInternalBillingState: vi.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
  requestHash: () => 'hash',
  requireBillingCaller: vi.fn(),
  retrieveCanonicalSubscription: vi.fn(),
  safeProviderErrorCode: (e) => e.message,
  syncSubscriptionProjection: vi.fn(),
  validateApprovedPrice: vi.fn(),
  validatePortalOrigin: () => 'https://app.example.test',
  writeBillingAudit: vi.fn(),
}));
const shared = await import('../../netlify/functions/billing-shared.mjs');
const { handler, validateTenantBillingInput, classifyChange, approvedPrices } =
  await import('../../netlify/functions/tenant-subscriptions.mjs');
const tenant = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
let stripe;
let ctx;
let state;
let sub;
const event = (action, extra = {}) => ({
  httpMethod: 'POST',
  body: JSON.stringify({ action, requestId, ...extra }),
});
beforeEach(() => {
  vi.clearAllMocks();
  sub = {
    id: 'sub_current',
    status: 'active',
    latest_invoice: { status: 'paid' },
    collection_method: 'charge_automatically',
    customer: 'cus_current',
    items: {
      data: [
        {
          id: 'si_current',
          quantity: 2,
          current_period_end: 2000000000,
          price: { id: 'price_month' },
        },
      ],
    },
  };
  state = {
    tenant_id: tenant,
    tenant_name: 'Example Transit',
    tenant_status: 'active',
    active_bus_count: 1,
    external_customer_id: 'cus_current',
    bus_access: { eligible: true },
  };
  ctx = {
    caller: { id: 'actor', tenant_id: tenant, email: 'admin@example.test' },
    config: { stripeProductId: 'prod_safebus', appOrigin: 'https://app.example.test' },
    admin: {
      rpc: vi.fn(async (name) => ({
        data:
          name === 'billing_find_customer'
            ? { tenant_id: tenant, trial_used: false }
            : { replayed: false },
        error: null,
      })),
    },
  };
  stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_current' })) },
    subscriptions: { list: vi.fn(async () => ({ data: [] })), update: vi.fn(async () => sub) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        expire: vi.fn(),
        create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/test' })),
      },
    },
    invoices: { createPreview: vi.fn(async () => ({ amount_due: 500, currency: 'cad' })) },
    subscriptionSchedules: {
      create: vi.fn(async () => ({
        id: 'sched_current',
        phases: [{ start_date: 1900000000, end_date: 2000000000 }],
      })),
      update: vi.fn(),
      retrieve: vi.fn(),
      release: vi.fn(),
    },
  };
  shared.requireBillingCaller.mockResolvedValue(ctx);
  shared.getInternalBillingState.mockResolvedValue(state);
  shared.createStripeClient.mockReturnValue(stripe);
  shared.retrieveCanonicalSubscription.mockImplementation(async () => sub);
  shared.syncSubscriptionProjection.mockResolvedValue({ applied: true });
  shared.validateApprovedPrice.mockResolvedValue({
    id: 'price_month',
    recurring: { interval: 'month' },
  });
});
describe('tenant subscription input and ownership', () => {
  it('rejects fractional, zero, excessive and malformed selections', () => {
    for (const quantity of [0, -1, 1.5, 10001, '2', NaN])
      expect(
        validateTenantBillingInput({
          action: 'checkout',
          requestId,
          quantity,
          priceId: 'price_month',
        }),
      ).toBeNull();
    expect(
      validateTenantBillingInput({
        action: 'checkout',
        requestId,
        quantity: 2,
        priceId: 'unapproved',
      }),
    ).toBeNull();
    expect(validateTenantBillingInput({ action: 'create', requestId })).toBeNull();
  });
  it('derives tenant ownership from the verified caller and requires recent authentication', async () => {
    const response = await handler(
      event('checkout', { tenantId: 'attacker', priceId: 'price_month', quantity: 2 }),
    );
    expect(response.statusCode).toBe(200);
    expect(shared.requireBillingCaller).toHaveBeenCalledWith(
      expect.anything(),
      ['tenant_admin'],
      expect.objectContaining({ recentAuth: true }),
    );
    expect(shared.getInternalBillingState).toHaveBeenCalledWith(ctx.admin, tenant);
    expect(stripe.checkout.sessions.create.mock.calls[0][0].client_reference_id).toBe(tenant);
  });
  it('returns authorization failures before contacting Stripe', async () => {
    shared.requireBillingCaller.mockResolvedValue({ error: { statusCode: 403 } });
    expect(
      (await handler(event('checkout', { priceId: 'price_month', quantity: 2 }))).statusCode,
    ).toBe(403);
    expect(shared.createStripeClient).not.toHaveBeenCalled();
  });
  it('rejects platform financial actions on the server before any provider call', async () => {
    const { handler: platform } =
      await import('../../netlify/functions/platform-subscriptions.mjs');
    const response = await platform(event('create', { tenantId: tenant }));
    expect(response.statusCode).toBe(403);
    expect(shared.createStripeClient).not.toHaveBeenCalled();
  });
  it('allows only approved CAD licensed monthly and yearly prices', async () => {
    const price = {
      id: 'price_month',
      currency: 'cad',
      unit_amount: 1000,
      recurring: { interval: 'month', usage_type: 'licensed' },
      product: { name: 'SafeBus' },
    };
    stripe.prices = {
      list: vi.fn(async () => ({
        data: [
          price,
          { ...price, id: 'price_year', recurring: { ...price.recurring, interval: 'year' } },
          { ...price, currency: 'usd' },
          { ...price, recurring: { ...price.recurring, interval_count: 3 } },
          { ...price, recurring: { ...price.recurring, usage_type: 'metered' } },
        ],
      })),
    };
    expect((await approvedPrices(stripe, 'prod_safebus')).map((p) => p.id)).toEqual([
      'price_month',
      'price_year',
    ]);
  });
});
describe('checkout and trial lifecycle', () => {
  it('collects a payment method and grants a new tenant one 14-day trial', async () => {
    await handler(event('checkout', { priceId: 'price_month', quantity: 3 }));
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: 'always',
        subscription_data: {
          trial_period_days: 14,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        },
        line_items: [{ price: 'price_month', quantity: 3 }],
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining(requestId) }),
    );
  });
  it('does not grant another trial after a canceled subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [{ status: 'canceled' }] });
    await handler(event('checkout', { priceId: 'price_month', quantity: 3 }));
    expect(stripe.checkout.sessions.create.mock.calls[0][0].subscription_data).toEqual({});
  });
  it('reuses an open checkout and rejects a second active subscription', async () => {
    stripe.checkout.sessions.list.mockResolvedValue({
      data: [
        {
          mode: 'subscription',
          client_reference_id: tenant,
          metadata: { price_id: 'price_month', quantity: '3' },
          url: 'https://checkout.stripe.com/existing',
        },
      ],
    });
    expect(
      JSON.parse((await handler(event('checkout', { priceId: 'price_month', quantity: 3 }))).body)
        .url,
    ).toContain('existing');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    stripe.subscriptions.list.mockResolvedValue({ data: [{ status: 'trialing' }] });
    expect(
      (await handler(event('checkout', { priceId: 'price_month', quantity: 3 }))).statusCode,
    ).toBe(409);
  });
  it('replays completed requests without another provider mutation', async () => {
    ctx.admin.rpc.mockResolvedValue({
      data: { replayed: true, response: { url: 'https://checkout.stripe.com/existing' } },
      error: null,
    });
    const response = await handler(event('checkout', { priceId: 'price_month', quantity: 3 }));
    expect(response.statusCode).toBe(200);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
describe('subscription changes', () => {
  beforeEach(() => {
    state.external_subscription_id = 'sub_current';
  });
  it('previews charges without modifying the subscription', async () => {
    const response = await handler(event('preview', { priceId: 'price_month', quantity: 4 }));
    expect(JSON.parse(response.body)).toMatchObject({ timing: 'immediate', dueNow: 500 });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('uses payment-gated prorated upgrades and does not extend trials', async () => {
    await handler(event('change', { priceId: 'price_month', quantity: 4 }));
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_current',
      expect.objectContaining({
        payment_behavior: 'pending_if_incomplete',
        proration_behavior: 'always_invoice',
      }),
      expect.anything(),
    );
    sub.status = 'trialing';
    sub.trial_end = 2000000000;
    await handler(event('change', { priceId: 'price_month', quantity: 4 }));
    const update = stripe.subscriptions.update.mock.calls[1][1];
    expect(update.proration_behavior).toBe('none');
    expect(update).not.toHaveProperty('trial_end');
  });
  it('reserves reductions and schedules cycle changes at renewal', async () => {
    expect(classifyChange(sub, 'price_year', 4)).toBe('renewal');
    await handler(event('change', { priceId: 'price_year', quantity: 1 }));
    expect(ctx.admin.rpc).toHaveBeenCalledWith(
      'billing_reserve_capacity',
      expect.objectContaining({ p_quantity: 1, p_tenant_id: tenant }),
    );
    expect(stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
      'sched_current',
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({
            start_date: 2000000000,
            items: [{ price: 'price_year', quantity: 1 }],
          }),
        ]),
      }),
      expect.anything(),
    );
  });
  it('preserves legacy invoice contracts and rejects reductions below usage', async () => {
    sub.collection_method = 'send_invoice';
    expect(
      (await handler(event('change', { priceId: 'price_month', quantity: 4 }))).statusCode,
    ).toBe(409);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    state.active_bus_count = 5;
    expect(
      (await handler(event('change', { priceId: 'price_month', quantity: 4 }))).statusCode,
    ).toBe(409);
  });
  it('cancels only at period end and supports resuming renewal', async () => {
    await handler(event('cancel'));
    expect(stripe.subscriptions.update.mock.calls[0][1].cancel_at_period_end).toBe(true);
    await handler(event('keep'));
    expect(stripe.subscriptions.update.mock.calls[1][1].cancel_at_period_end).toBe(false);
  });
});
