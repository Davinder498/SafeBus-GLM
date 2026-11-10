import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  clean: (v) => (typeof v === 'string' ? v.trim() : ''),
  requestHash: (value) => JSON.stringify(value),
  createStripeClient: vi.fn(),
  getInternalBillingState: vi.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
  requireBillingCaller: vi.fn(),
  requireDistrictBillingAgreement: vi.fn(),
  retrieveCanonicalSubscription: vi.fn(),
  safeProviderErrorCode: (err) => err?.message ?? 'billing_provider_error',
  syncSubscriptionProjection: vi.fn(),
  validateApprovedPrice: vi.fn(),
  writeBillingAudit: vi.fn(),
}));
const shared = await import('../../netlify/functions/billing-shared.mjs');
const { handler, validateInvoiceBillingInput, invoiceSelectionFingerprint } =
  await import('../../netlify/functions/invoice-billing.mjs');

const tenant = '11111111-1111-4111-8111-111111111111';
const otherTenant = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const actor = '44444444-4444-4444-8444-444444444444';
const platformActor = '55555555-5555-4555-8555-555555555555';
const address = {
  line1: '100 Example Plaza',
  city: 'Edmonton',
  state: 'AB',
  postalCode: 'T5J2N2',
  country: 'CA',
};
const event = (action, extra = {}) => ({
  httpMethod: 'POST',
  body: JSON.stringify({
    action,
    ...(action === 'status'
      ? {}
      : action === 'activate'
        ? { requestId: '66666666-6666-4666-8666-666666666666', arrangementId: requestId }
        : { requestId }),
    ...extra,
  }),
});
const request = () => ({
  priceId: 'price_ABC123',
  quantity: 3,
  billingEmail: 'billing@example.test',
  purchaseOrder: 'PO-1234',
  address,
});
const metadata = (status = 'pending') => {
  const m = {
    safebus_tenant_id: tenant,
    safebus_invoice_tenant_id: tenant,
    safebus_invoice_request_id: requestId,
    safebus_invoice_price_id: 'price_ABC123',
    safebus_invoice_quantity: '3',
    safebus_invoice_po: 'PO-1234',
    safebus_invoice_status: status,
    safebus_invoice_approved_by: ['approved', 'activated'].includes(status) ? platformActor : '',
    safebus_invoice_approved_at: ['approved', 'activated'].includes(status)
      ? '2026-11-09T12:00:00Z'
      : '',
    safebus_invoice_days_until_due: '30',
    safebus_invoice_reviewed_request_id: ['approved', 'activated', 'rejected'].includes(status)
      ? requestId
      : '',
  };
  if (['approved', 'activated'].includes(status))
    m.safebus_invoice_approval_fingerprint = invoiceSelectionFingerprint(
      { ...customer, metadata: m },
      30,
    );
  return m;
};
const result = (response) => JSON.parse(response.body);
let customer, history, ctx, platform, stripe, state, subscription;
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    tenant_id: tenant,
    tenant_name: 'Test School Authority',
    tenant_status: 'active',
    external_customer_id: 'cus_example',
    external_subscription_id: null,
    active_bus_count: 1,
    bus_access: { eligible: true, exempt: false },
  };
  customer = {
    id: 'cus_example',
    email: 'billing@example.test',
    address: {
      line1: '100 Example Plaza',
      city: 'Edmonton',
      state: 'AB',
      postal_code: 'T5J2N2',
      country: 'CA',
    },
    metadata: {},
  };
  history = { data: [], has_more: false };
  subscription = {
    id: 'sub_invoice',
    status: 'trialing',
    collection_method: 'send_invoice',
    metadata: { safebus_tenant_id: tenant, safebus_invoice_request_id: requestId },
  };
  const admin = {
    rpc: vi.fn(async (name) => ({
      data:
        name === 'billing_find_customer'
          ? { tenant_id: tenant, trial_used: false }
          : name === 'billing_claim_operation'
            ? { replayed: false }
            : { ok: true },
      error: null,
    })),
  };
  ctx = {
    caller: { id: actor, tenant_id: tenant, email: 'admin@example.test' },
    config: { stripeProductId: 'prod_safebus' },
    admin,
  };
  platform = {
    ...ctx,
    caller: { id: platformActor, role: 'platform_super_admin', tenant_id: null },
  };
  stripe = {
    customers: {
      retrieve: vi.fn(async () => customer),
      create: vi.fn(async (params) => {
        customer = { ...params, id: 'cus_example' };
        return customer;
      }),
      update: vi.fn(async (_id, params) => {
        customer = {
          ...customer,
          ...params,
          metadata: { ...customer.metadata, ...params.metadata },
        };
        return customer;
      }),
    },
    subscriptions: {
      list: vi.fn(async () => history),
      create: vi.fn(async () => subscription),
      update: vi.fn(async (_id, params) => ({
        ...subscription,
        cancel_at_period_end: params.cancel_at_period_end,
      })),
    },
    checkout: { sessions: { list: vi.fn(async () => ({ data: [], has_more: false })) } },
  };
  shared.createStripeClient.mockReturnValue(stripe);
  shared.getInternalBillingState.mockResolvedValue(state);
  shared.requireBillingCaller.mockImplementation(async (_event, roles) =>
    roles.includes('platform_super_admin') ? platform : ctx,
  );
  shared.requireDistrictBillingAgreement.mockResolvedValue(null);
  shared.validateApprovedPrice.mockResolvedValue({
    id: 'price_ABC123',
    tax_behavior: 'inclusive',
    unit_amount: 199,
  });
  shared.retrieveCanonicalSubscription.mockImplementation(async () => subscription);
  shared.syncSubscriptionProjection.mockResolvedValue({ applied: true, status: 'trialing' });
  shared.writeBillingAudit.mockResolvedValue(undefined);
});
describe('approved invoice billing request', () => {
  it.each([7, 13, 21, 61])(
    'rejects an unapproved invoice payment window: %s days',
    (daysUntilDue) => {
      expect(
        validateInvoiceBillingInput({
          action: 'review',
          tenantId: tenant,
          requestId,
          approve: true,
          daysUntilDue,
        }),
      ).toBeNull();
    },
  );
  it('refuses a competing billing lease before any provider write and replays completed operations without another subscription', async () => {
    customer.metadata = metadata('approved');
    ctx.admin.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'billing_operation_busy' },
    });
    const blocked = await handler(event('activate'));
    expect(blocked.statusCode).toBe(409);
    expect(result(blocked).retryable).toBe(true);
    expect(stripe.customers.update).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    ctx.admin.rpc.mockResolvedValueOnce({
      data: { replayed: true, response: { ok: true, status: 'activated' } },
      error: null,
    });
    expect(result(await handler(event('activate')))).toEqual({ ok: true, status: 'activated' });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
  it('serializes two invoice activations through the same authority-wide billing lease', async () => {
    customer.metadata = metadata('approved');
    let leased = false,
      release;
    ctx.admin.rpc.mockImplementation(async (name) => {
      if (name === 'billing_claim_operation') {
        if (leased) return { data: null, error: { message: 'billing_operation_busy' } };
        leased = true;
        return { data: { replayed: false }, error: null };
      }
      if (name === 'billing_finish_operation') leased = false;
      return {
        data: name === 'billing_find_customer' ? { tenant_id: tenant, trial_used: false } : null,
        error: null,
      };
    });
    stripe.subscriptions.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(subscription);
        }),
    );
    const first = handler(event('activate'));
    await vi.waitFor(() => expect(stripe.subscriptions.create).toHaveBeenCalledOnce());
    const competing = await handler(
      event('activate', { requestId: '77777777-7777-4777-8777-777777777777' }),
    );
    expect(competing.statusCode).toBe(409);
    expect(stripe.subscriptions.create).toHaveBeenCalledOnce();
    release();
    expect((await first).statusCode).toBe(200);
    expect(shared.syncSubscriptionProjection).toHaveBeenCalledWith(
      ctx.admin,
      stripe,
      subscription,
      expect.any(String),
      '66666666-6666-4666-8666-666666666666',
    );
    expect(leased).toBe(false);
  });
  it('a delayed approval of an old request cannot approve changed invoice terms', async () => {
    customer.metadata = metadata('pending');
    const originalUpdate = stripe.customers.update.getMockImplementation();
    let release;
    stripe.customers.update.mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          release = async () => resolve(await originalUpdate(...args));
        }),
    );
    const reviewing = handler(
      event('review', { tenantId: tenant, approve: true, daysUntilDue: 30 }),
    );
    await vi.waitFor(() => expect(stripe.customers.update).toHaveBeenCalledOnce());
    customer.metadata = {
      ...metadata('pending'),
      safebus_invoice_request_id: '77777777-7777-4777-8777-777777777777',
      safebus_invoice_quantity: '9',
    };
    await release();
    expect(result(await reviewing).arrangement.status).toBe('pending');
    const activation = await handler(
      event('activate', { arrangementId: '77777777-7777-4777-8777-777777777777' }),
    );
    expect(activation.statusCode).toBe(409);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
  it('an unchanged provider renewal still repairs a previously failed local projection', async () => {
    customer.metadata = metadata('activated');
    state.external_subscription_id = 'sub_invoice';
    subscription.cancel_at_period_end = true;
    shared.syncSubscriptionProjection.mockResolvedValueOnce({ applied: false });
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(503);
    expect(ctx.admin.rpc.mock.calls.some(([name]) => name === 'billing_finish_operation')).toBe(
      false,
    );
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(200);
    expect(shared.syncSubscriptionProjection).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('competing review decisions use one provider idempotency key', async () => {
    customer.metadata = metadata('pending');
    const captured = [];
    const update = stripe.customers.update.getMockImplementation();
    stripe.customers.update.mockImplementation(async (...args) => {
      captured.push(args[2].idempotencyKey);
      if (captured.length > 1) throw new Error('idempotency_error');
      return update(...args);
    });
    const results = await Promise.all([
      handler(event('review', { tenantId: tenant, approve: true, daysUntilDue: 30 })),
      handler(event('review', { tenantId: tenant, approve: false, daysUntilDue: 30 })),
    ]);
    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(customer.metadata.safebus_invoice_status).toBe('approved');
  });
  it('rejects invalid email, PO, quantity and Canadian address', () => {
    expect(
      validateInvoiceBillingInput({ action: 'request', requestId, ...request() }),
    ).toBeTruthy();
    for (const modified of [
      { billingEmail: 'invalid' },
      { quantity: 0 },
      { priceId: 'fake' },
      { purchaseOrder: '<script>' },
      { address: { ...address, state: 'ZZ' } },
      { address: { ...address, postalCode: 'invalid' } },
      { address: { ...address, country: 'US' } },
    ])
      expect(
        validateInvoiceBillingInput({ action: 'request', requestId, ...request(), ...modified }),
      ).toBeNull();
  });
  it('requires an active authenticated tenant and executed district agreement', async () => {
    shared.requireBillingCaller.mockResolvedValueOnce({ error: { statusCode: 403 } });
    expect((await handler(event('request', request()))).statusCode).toBe(403);
    shared.requireDistrictBillingAgreement.mockResolvedValueOnce({ statusCode: 409 });
    expect((await handler(event('request', request()))).statusCode).toBe(409);
    expect(stripe.customers.update).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
  it('creates only a pending customer request, never an invoice or subscription', async () => {
    const output = await handler(event('request', request()));
    expect(output.statusCode).toBe(200);
    expect(result(output).arrangement).toMatchObject({ status: 'pending', requestId, quantity: 3 });
    expect(stripe.customers.update).toHaveBeenCalledWith(
      'cus_example',
      expect.objectContaining({
        metadata: expect.objectContaining({
          safebus_invoice_status: 'pending',
          safebus_invoice_tenant_id: tenant,
        }),
      }),
      expect.anything(),
    );
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(shared.writeBillingAudit).toHaveBeenCalledWith(
      ctx.admin,
      actor,
      'billing.subscription_updated',
      tenant,
      { invoiceArrangement: 'requested' },
    );
  });
  it('platform administrator approval is separately recorded without charging', async () => {
    customer.metadata = metadata();
    const output = await handler(
      event('review', { tenantId: tenant, approve: true, daysUntilDue: 30 }),
    );
    expect(output.statusCode).toBe(200);
    expect(result(output).arrangement.status).toBe('approved');
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(shared.writeBillingAudit).toHaveBeenCalledWith(
      platform.admin,
      platformActor,
      'billing.subscription_updated',
      tenant,
      { invoiceArrangement: 'approved', invoiceDaysUntilDue: 30 },
    );
  });
  it('denies unapproved, cross-district or insufficient-bus invoice activation', async () => {
    customer.metadata = metadata('rejected');
    expect((await handler(event('activate'))).statusCode).toBe(409);
    customer.metadata = { ...metadata('approved'), safebus_invoice_tenant_id: otherTenant };
    expect((await handler(event('activate'))).statusCode).toBe(409);
    customer.metadata = metadata('approved');
    state.active_bus_count = 4;
    expect((await handler(event('activate'))).statusCode).toBe(409);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
  it('starts a first-time 14-day trial with a net-30 invoice after trial and inclusive tax', async () => {
    customer.metadata = metadata('approved');
    const output = await handler(event('activate'));
    expect(output.statusCode).toBe(200);
    expect(result(output)).toMatchObject({ status: 'activated', trialGranted: true });
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: 'price_ABC123', quantity: 3 }],
        collection_method: 'send_invoice',
        days_until_due: 30,
        automatic_tax: { enabled: true },
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'create_invoice' } },
        metadata: expect.objectContaining({
          safebus_tenant_id: tenant,
          safebus_invoice_request_id: requestId,
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining(requestId) }),
    );
    expect(shared.syncSubscriptionProjection).toHaveBeenCalledOnce();
    expect(customer.metadata.safebus_invoice_status).toBe('activated');
    expect(customer.metadata.safebus_purchase_order_reference).toBe('PO-1234');
    expect(customer.invoice_settings.custom_fields).toContainEqual({
      name: 'Purchase order',
      value: 'PO-1234',
    });
  });
  it('denies a second trial and preserves due-now invoicing on a previously canceled plan', async () => {
    customer.metadata = metadata('approved');
    history.data = [{ id: 'sub_previous', status: 'canceled', metadata: {} }];
    ctx.admin.rpc.mockImplementation(async (name) => ({
      data:
        name === 'billing_find_customer'
          ? { tenant_id: tenant, trial_used: true }
          : name === 'billing_claim_operation'
            ? { replayed: false }
            : { ok: true },
      error: null,
    }));
    expect((await handler(event('activate'))).statusCode).toBe(200);
    expect(stripe.subscriptions.create.mock.calls[0][0]).not.toHaveProperty('trial_period_days');
  });
  it('recovers a provider-created invoice subscription without duplicating it', async () => {
    customer.metadata = metadata('approved');
    history.data = [{ id: 'sub_invoice', status: 'trialing', metadata: subscription.metadata }];
    expect((await handler(event('activate'))).statusCode).toBe(200);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(shared.syncSubscriptionProjection).toHaveBeenCalledOnce();
  });
  it('prevents parallel checkout, unrelated subscriptions and provider failure success', async () => {
    customer.metadata = metadata('approved');
    history.data = [{ id: 'sub_other', status: 'active', metadata: {} }];
    expect((await handler(event('activate'))).statusCode).toBe(409);
    history.data = [];
    stripe.checkout.sessions.list.mockResolvedValue({
      data: [{ mode: 'subscription' }],
      has_more: false,
    });
    expect((await handler(event('activate'))).statusCode).toBe(409);
    stripe.checkout.sessions.list.mockResolvedValue({ data: [], has_more: false });
    stripe.subscriptions.create.mockRejectedValue(new Error('provider unavailable'));
    expect((await handler(event('activate'))).statusCode).toBe(503);
    expect(customer.metadata.safebus_invoice_status).toBe('approved');
  });
  it('allows a tenant administrator to cancel or restore only an approved invoice renewal', async () => {
    customer.metadata = metadata('activated');
    state.external_subscription_id = 'sub_invoice';
    subscription.cancel_at_period_end = false;
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_invoice',
      expect.objectContaining({ cancel_at_period_end: true, proration_behavior: 'none' }),
      expect.anything(),
    );
    expect(shared.syncSubscriptionProjection).toHaveBeenCalled();
    expect(shared.writeBillingAudit).toHaveBeenCalledWith(
      ctx.admin,
      actor,
      'billing.cancellation_scheduled',
      tenant,
    );
    subscription.cancel_at_period_end = true;
    expect((await handler(event('resume_renewal'))).statusCode).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_invoice',
      expect.objectContaining({ cancel_at_period_end: false, proration_behavior: 'none' }),
      expect.anything(),
    );
  });
  it('preserves an annual invoice term on cancellation, without refunding issued invoices', async () => {
    customer.metadata = metadata('activated');
    state.external_subscription_id = 'sub_invoice';
    subscription.status = 'active';
    subscription.cancel_at_period_end = false;
    subscription.items = { data: [{ price: { recurring: { interval: 'year' } }, quantity: 3 }] };
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(200);
    const params = stripe.subscriptions.update.mock.calls[0][1];
    expect(params).toMatchObject({ cancel_at_period_end: true, proration_behavior: 'none' });
    expect(params).not.toHaveProperty('cancel_at');
    expect(stripe.subscriptions).not.toHaveProperty('cancel');
    expect(stripe).not.toHaveProperty('refunds');
    expect(stripe).not.toHaveProperty('invoices');
  });
  it('never modifies a legacy or foreign invoice subscription through the new renewal path', async () => {
    customer.metadata = metadata('activated');
    state.external_subscription_id = 'sub_invoice';
    subscription.metadata = {};
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(409);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    subscription.metadata = {
      safebus_tenant_id: otherTenant,
      safebus_invoice_request_id: requestId,
    };
    expect((await handler(event('cancel_renewal'))).statusCode).toBe(409);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('does not report success if the private subscription projection refused the write', async () => {
    customer.metadata = metadata('approved');
    shared.syncSubscriptionProjection.mockResolvedValueOnce({ applied: false });
    expect((await handler(event('activate'))).statusCode).toBe(503);
    expect(customer.metadata.safebus_invoice_status).toBe('approved');
  });
  it('preserves unrelated invoice custom fields when adding a purchase-order number', async () => {
    customer.metadata = metadata('approved');
    customer.invoice_settings = {
      custom_fields: [{ name: 'Department', value: 'Transportation' }],
    };
    expect((await handler(event('activate'))).statusCode).toBe(200);
    expect(customer.invoice_settings.custom_fields).toEqual([
      { name: 'Department', value: 'Transportation' },
      { name: 'Purchase order', value: 'PO-1234' },
    ]);
  });
});
