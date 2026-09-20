import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('stripe', () => ({ default: vi.fn() }));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SECRET_KEY = 'secret-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_example';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
process.env.STRIPE_SAFEBUS_PRODUCT_ID = 'prod_safebus';
process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_example';
process.env.SAFEBUS_APP_ORIGIN = 'https://app.example.test';

const Stripe = (await import('stripe')).default;
const { createClient } = await import('@supabase/supabase-js');
const { validateMutationInput } =
  await import('../../netlify/functions/platform-subscriptions.mjs');
const { requestHash, safeProviderErrorCode, validatePortalOrigin } =
  await import('../../netlify/functions/billing-shared.mjs');
const { handler: webhookHandler } = await import('../../netlify/functions/stripe-webhook.mjs');

const validMutation = {
  action: 'create',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  tenantId: '223e4567-e89b-42d3-a456-426614174000',
  priceId: 'price_annualbus',
  billingEmail: ' BILLING@EXAMPLE.CA ',
  licensedBusCount: 10,
  purchaseOrderReference: 'PO-2026-01',
  daysUntilDue: 30,
  trialEnd: '2099-12-31',
  autoRenew: true,
};

function stripeEvent(type = 'customer.subscription.updated') {
  return {
    id: 'evt_123',
    type,
    created: 1_800_000_000,
    data: { object: { id: 'sub_123' } },
  };
}

function canonicalSubscription() {
  return {
    id: 'sub_123',
    status: 'active',
    customer: {
      id: 'cus_123',
      deleted: false,
      email: 'billing@example.ca',
      metadata: { safebus_tenant_id: validMutation.tenantId },
    },
    metadata: { safebus_tenant_id: validMutation.tenantId },
    items: {
      data: [
        {
          id: 'si_123',
          quantity: 10,
          current_period_start: 1_800_000_000,
          current_period_end: 1_831_536_000,
          price: {
            id: 'price_annualbus',
            active: true,
            type: 'recurring',
            currency: 'cad',
            unit_amount: 10000,
            recurring: { interval: 'year', usage_type: 'licensed' },
            product: { id: 'prod_safebus', name: 'SafeBus Fleet Annual' },
          },
        },
      ],
    },
    latest_invoice: { id: 'in_123', status: 'paid', due_date: 1_800_100_000 },
    days_until_due: 30,
    cancel_at_period_end: false,
    trial_end: null,
    cancel_at: null,
    canceled_at: null,
  };
}

describe('subscription mutation validation', () => {
  it('normalizes an approved annual-contract request', () => {
    expect(validateMutationInput(validMutation)).toMatchObject({
      billingEmail: 'billing@example.ca',
      licensedBusCount: 10,
      daysUntilDue: 30,
      autoRenew: true,
    });
  });

  it('rejects invalid identifiers, quantities, terms, and control characters', () => {
    expect(validateMutationInput({ ...validMutation, requestId: 'not-a-uuid' })).toBeNull();
    expect(validateMutationInput({ ...validMutation, licensedBusCount: -1 })).toBeNull();
    expect(validateMutationInput({ ...validMutation, daysUntilDue: 91 })).toBeNull();
    expect(
      validateMutationInput({ ...validMutation, purchaseOrderReference: 'PO\nBcc: attacker' }),
    ).toBeNull();
    expect(validateMutationInput({ ...validMutation, autoRenew: 'yes' })).toBeNull();
  });

  it('uses stable request fingerprints and safe portal origins', () => {
    expect(requestHash(validMutation)).toMatch(/^[0-9a-f]{64}$/);
    expect(validatePortalOrigin('https://app.example.test/path?x=1')).toBe(
      'https://app.example.test',
    );
    expect(validatePortalOrigin('javascript:alert(1)')).toBeNull();
    expect(safeProviderErrorCode(new Error('No such customer: cus_sensitive'))).toBe(
      'billing_provider_error',
    );
    expect(safeProviderErrorCode(new Error('billing_subscription_not_configured'))).toBe(
      'billing_subscription_not_configured',
    );
  });
});

describe('Stripe webhook boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an invalid signature before opening a database client', async () => {
    Stripe.mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('invalid');
        }),
      },
    }));
    const response = await webhookHandler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'invalid' },
      body: '{}',
    });
    expect(response.statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('silently accepts unsupported signed events', async () => {
    Stripe.mockImplementation(() => ({
      webhooks: { constructEvent: vi.fn(() => stripeEvent('charge.succeeded')) },
    }));
    const response = await webhookHandler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'valid' },
      body: '{}',
    });
    expect(response.statusCode).toBe(200);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('deduplicates a previously completed event', async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    createClient.mockReturnValue({ rpc });
    Stripe.mockImplementation(() => ({
      webhooks: { constructEvent: vi.fn(() => stripeEvent()) },
    }));
    const response = await webhookHandler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'valid' },
      body: '{}',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).duplicate).toBe(true);
  });

  it('reconciles a signed supported event without logging provider values', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    createClient.mockReturnValue({ rpc });
    const subscription = canonicalSubscription();
    Stripe.mockImplementation(() => ({
      webhooks: { constructEvent: vi.fn(() => stripeEvent()) },
      subscriptions: { retrieve: vi.fn(async () => subscription) },
      products: { retrieve: vi.fn() },
      customers: { retrieve: vi.fn() },
      invoices: { retrieve: vi.fn() },
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await webhookHandler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'valid' },
      body: '{}',
    });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'billing_upsert_projection',
      expect.objectContaining({ p_tenant_id: validMutation.tenantId, p_licensed_bus_count: 10 }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('billing@example.ca');
    expect(JSON.stringify(log.mock.calls)).not.toContain('cus_123');
  });
});
