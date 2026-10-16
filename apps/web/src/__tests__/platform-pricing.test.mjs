import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  UUID_PATTERN: /^[0-9a-f-]{36}$/,
  clean: (v) => (typeof v === 'string' ? v.trim() : ''),
  createStripeClient: vi.fn(),
  requireBillingCaller: vi.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
  requestHash: () => 'a'.repeat(64),
  safeProviderErrorCode: () => 'billing_provider_error',
}));
const shared = await import('../../netlify/functions/billing-shared.mjs');
const { handler, validateCatalogInput } =
  await import('../../netlify/functions/platform-pricing.mjs');
const requestId = '20000000-0000-4000-8000-000000000001';
const priceInput = {
  action: 'create_price',
  requestId,
  name: 'Test monthly',
  unitAmount: 2500,
  interval: 'month',
};
const discountInput = {
  action: 'create_discount',
  requestId,
  name: 'Synthetic offer',
  code: 'QA-ONLY',
  kind: 'percent',
  value: 12.5,
  duration: 'once',
  maxRedemptions: 5,
  expiresAt: 4000000000,
};
const price = {
  id: 'price_test',
  product: 'prod_safebus',
  nickname: 'Test monthly',
  type: 'recurring',
  active: true,
  currency: 'cad',
  unit_amount: 2500,
  recurring: { interval: 'month', usage_type: 'licensed', interval_count: 1 },
};
const coupon = {
  id: `safebus_${requestId.replaceAll('-', '')}`,
  name: 'Synthetic offer',
  applies_to: { products: ['prod_safebus'] },
  percent_off: 12.5,
  duration: 'once',
  valid: true,
};
const code = {
  id: 'promo_test',
  code: 'QA-ONLY',
  active: true,
  promotion: { type: 'coupon', coupon },
  times_redeemed: 0,
  max_redemptions: 5,
  expires_at: 4000000000,
};
const event = (body) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
let stripe, ctx;
beforeEach(() => {
  vi.clearAllMocks();
  ctx = {
    caller: { id: 'actor', role: 'platform_super_admin' },
    config: { stripeProductId: 'prod_safebus' },
    admin: {
      rpc: vi.fn(async (name) => ({
        data: name === 'billing_get_pending_catalog_operation' ? null : { replayed: false },
        error: null,
      })),
    },
  };
  stripe = {
    products: { retrieve: vi.fn(async () => ({ id: 'prod_safebus', active: true })) },
    prices: {
      list: vi.fn(async () => ({ data: [] })),
      retrieve: vi.fn(async () => price),
      create: vi.fn(async () => price),
      update: vi.fn(async () => price),
    },
    coupons: {
      retrieve: vi.fn(async () => {
        throw { code: 'resource_missing' };
      }),
      create: vi.fn(async () => coupon),
    },
    promotionCodes: {
      list: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async () => code),
      retrieve: vi.fn(async () => code),
      update: vi.fn(async () => code),
    },
  };
  shared.requireBillingCaller.mockResolvedValue(ctx);
  shared.createStripeClient.mockReturnValue(stripe);
});
describe('catalog ownership and request boundary', () => {
  it('rejects invalid intervals, amounts, limits, percentages and unknown actions', () => {
    for (const unitAmount of [0, -1, 1.5, '25', 100000001])
      expect(validateCatalogInput({ ...priceInput, unitAmount })).toBeNull();
    expect(validateCatalogInput({ ...priceInput, interval: 'week' })).toBeNull();
    for (const value of [0, 101, 33.333, NaN])
      expect(validateCatalogInput({ ...discountInput, value })).toBeNull();
    expect(validateCatalogInput({ ...discountInput, value: 32.29 })).not.toBeNull();
    expect(validateCatalogInput({ ...discountInput, code: 'bad code' })).toBeNull();
    expect(validateCatalogInput({ ...discountInput, maxRedemptions: 0 })).toBeNull();
    expect(validateCatalogInput({ ...discountInput, duration: 'repeating' })).toBeNull();
    expect(validateCatalogInput({ action: 'change_subscription', requestId })).toBeNull();
    expect(validateCatalogInput({ action: 'list', priceCursor: '../escape' })).toBeNull();
  });
  it('requires platform authorization before contacting the provider', async () => {
    shared.requireBillingCaller.mockResolvedValue({ error: { statusCode: 403 } });
    expect((await handler(event(priceInput))).statusCode).toBe(403);
    expect(shared.createStripeClient).not.toHaveBeenCalled();
    expect(shared.requireBillingCaller).toHaveBeenCalledWith(
      expect.anything(),
      ['platform_super_admin'],
      expect.objectContaining({ recentAuth: true, rateLimitAction: 'billing_mutation' }),
    );
  });
  it('uses only the configured product and leaves tax and existing subscriptions untouched', async () => {
    expect(
      (await handler(event({ ...priceInput, productId: 'prod_attacker', tenantId: 'victim' })))
        .statusCode,
    ).toBe(200);
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_safebus',
        unit_amount: 2500,
        currency: 'cad',
        recurring: { interval: 'month', usage_type: 'licensed' },
        lookup_key: `safebus_${requestId.replaceAll('-', '')}`,
      }),
      expect.objectContaining({ idempotencyKey: `safebus:catalog:${requestId}:price` }),
    );
    expect(stripe.prices.create.mock.calls[0][0]).not.toHaveProperty('tax_behavior');
    expect(ctx.admin.rpc).toHaveBeenCalledWith(
      'billing_finish_catalog_operation',
      expect.objectContaining({ p_actor_id: 'actor', p_response: { id: 'price_test' } }),
    );
  });
  it('publishes both approved billing intervals', async () => {
    expect((await handler(event({ ...priceInput, interval: 'year' }))).statusCode).toBe(200);
    expect(stripe.prices.create.mock.calls[0][0].recurring.interval).toBe('year');
  });
  it('rejects archiving a price from another product', async () => {
    stripe.prices.retrieve.mockResolvedValue({ ...price, product: 'prod_other' });
    expect(
      (await handler(event({ action: 'set_price_active', requestId, id: price.id, active: false })))
        .statusCode,
    ).toBe(409);
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });
  it('archives prices without modifying their amount or interval', async () => {
    expect(
      (await handler(event({ action: 'set_price_active', requestId, id: price.id, active: false })))
        .statusCode,
    ).toBe(200);
    expect(stripe.prices.update).toHaveBeenCalledWith(
      price.id,
      { active: false },
      expect.anything(),
    );
  });
});
describe('coupons and retry recovery', () => {
  it('restricts discounts to SafeBus and creates a redeemable promotion code', async () => {
    expect((await handler(event(discountInput))).statusCode).toBe(200);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `safebus_${requestId.replaceAll('-', '')}`,
        percent_off: 12.5,
        applies_to: { products: ['prod_safebus'] },
        max_redemptions: 5,
      }),
      expect.anything(),
    );
    expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promotion: { type: 'coupon', coupon: `safebus_${requestId.replaceAll('-', '')}` },
        code: 'QA-ONLY',
        max_redemptions: 5,
        expires_at: 4000000000,
      }),
      expect.anything(),
    );
  });
  it('creates fixed CAD discounts without interpreting them as per-bus discounts', async () => {
    expect(
      (await handler(event({ ...discountInput, kind: 'amount', value: 1500, duration: 'forever' })))
        .statusCode,
    ).toBe(200);
    const body = stripe.coupons.create.mock.calls[0][0];
    expect(body).toMatchObject({ amount_off: 1500, currency: 'cad', duration: 'forever' });
    expect(body).not.toHaveProperty('percent_off');
  });
  it('recovers after a coupon succeeds but promotion creation is interrupted', async () => {
    stripe.coupons.retrieve.mockResolvedValue(coupon);
    stripe.promotionCodes.list.mockResolvedValue({ data: [code] });
    expect((await handler(event(discountInput))).statusCode).toBe(200);
    expect(stripe.coupons.create).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.create).not.toHaveBeenCalled();
  });
  it('reuses a provider price even beyond the idempotency retention period', async () => {
    stripe.prices.list.mockResolvedValue({ data: [price] });
    expect((await handler(event(priceInput))).statusCode).toBe(200);
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });
  it('replays completed ledger results without another write', async () => {
    ctx.admin.rpc.mockResolvedValue({
      data: { replayed: true, response: { id: 'price_test' } },
      error: null,
    });
    expect(JSON.parse((await handler(event(priceInput))).body)).toEqual({
      id: 'price_test',
      replayed: true,
    });
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });
  it('retains uncertain requests for a retry when durable confirmation fails', async () => {
    ctx.admin.rpc.mockImplementation(async (name) => ({
      data: { replayed: false },
      error: name === 'billing_finish_catalog_operation' ? { message: 'unavailable' } : null,
    }));
    const response = await handler(event(priceInput));
    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).retryable).toBe(true);
  });
  it('filters catalog pages to CAD per-bus prices and product-restricted discounts', async () => {
    stripe.prices.list.mockResolvedValue({
      data: [price, { ...price, id: 'price_other', currency: 'usd' }],
      has_more: true,
    });
    stripe.promotionCodes.list.mockResolvedValue({
      data: [
        code,
        {
          ...code,
          id: 'promo_other',
          promotion: { coupon: { ...coupon, applies_to: { products: ['prod_other'] } } },
        },
      ],
    });
    const response = JSON.parse((await handler(event({ action: 'list' }))).body);
    expect(response.prices.map((p) => p.id)).toEqual(['price_test']);
    expect(response.discounts.map((p) => p.id)).toEqual(['promo_test']);
    expect(response.priceCursor).toBe('price_other');
    expect(shared.requireBillingCaller.mock.calls[0][2].recentAuth).toBe(false);
  });
  it('only deactivates a promotion code, preserving already redeemed discounts', async () => {
    expect(
      (
        await handler(
          event({ action: 'set_discount_active', requestId, id: code.id, active: false }),
        )
      ).statusCode,
    ).toBe(200);
    expect(stripe.promotionCodes.update).toHaveBeenCalledWith(
      code.id,
      { active: false },
      expect.anything(),
    );
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });
});
