import {
  UUID_PATTERN,
  clean,
  createStripeClient,
  json,
  requestHash,
  requireBillingCaller,
  safeProviderErrorCode,
} from './billing-shared.mjs';

const actions = ['create_price', 'set_price_active', 'create_discount', 'set_discount_active'];
const providerId = (value, prefix) => new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value ?? '');
const whole = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;

export function validateCatalogInput(body) {
  const action = body?.action;
  if (action === 'pending_request') return { action };
  if (action === 'list') {
    for (const [field, prefix] of [
      ['priceCursor', 'price'],
      ['discountCursor', 'promo'],
    ])
      if (body[field] && !providerId(body[field], prefix)) return null;
    return {
      action,
      priceCursor: body.priceCursor || null,
      discountCursor: body.discountCursor || null,
    };
  }
  if (!actions.includes(action) || !UUID_PATTERN.test(body.requestId ?? '')) return null;
  const common = { action, requestId: body.requestId };
  if (action === 'create_price') {
    const name = clean(body.name);
    if (
      !name ||
      name.length > 80 ||
      !whole(body.unitAmount, 100000000) ||
      !['month', 'year'].includes(body.interval)
    )
      return null;
    return { ...common, name, unitAmount: body.unitAmount, interval: body.interval };
  }
  if (action === 'set_price_active' || action === 'set_discount_active') {
    if (
      !providerId(body.id, action === 'set_price_active' ? 'price' : 'promo') ||
      typeof body.active !== 'boolean'
    )
      return null;
    return { ...common, id: body.id, active: body.active };
  }
  const name = clean(body.name);
  const code = clean(body.code).toUpperCase();
  if (
    !name ||
    name.length > 80 ||
    !/^[A-Z0-9-]{3,40}$/.test(code) ||
    !['percent', 'amount'].includes(body.kind) ||
    !['once', 'forever'].includes(body.duration)
  )
    return null;
  if (
    body.kind === 'percent'
      ? !Number.isFinite(body.value) ||
        body.value <= 0 ||
        body.value > 100 ||
        Math.round(body.value * 100) / 100 !== body.value
      : !whole(body.value, 100000000)
  )
    return null;
  if (body.maxRedemptions != null && !whole(body.maxRedemptions, 1000000)) return null;
  if (body.expiresAt != null && !whole(body.expiresAt, 9999999999)) return null;
  return {
    ...common,
    name,
    code,
    kind: body.kind,
    value: body.value,
    duration: body.duration,
    maxRedemptions: body.maxRedemptions ?? null,
    expiresAt: body.expiresAt ?? null,
  };
}

function ownsPrice(price, productId) {
  return (
    (typeof price.product === 'string' ? price.product : price.product?.id) === productId &&
    price.type === 'recurring' &&
    price.currency === 'cad' &&
    ['month', 'year'].includes(price.recurring?.interval) &&
    (price.recurring.interval_count ?? 1) === 1 &&
    price.recurring.usage_type === 'licensed' &&
    (price.billing_scheme ?? 'per_unit') === 'per_unit' &&
    !price.transform_quantity &&
    Number.isSafeInteger(price.unit_amount)
  );
}
function ownsCoupon(coupon, productId) {
  return (
    coupon &&
    !coupon.deleted &&
    (!coupon.amount_off || coupon.currency === 'cad') &&
    coupon.applies_to?.products?.length === 1 &&
    coupon.applies_to.products[0] === productId
  );
}
function priceSummary(p) {
  return {
    id: p.id,
    name: p.nickname || 'SafeBus',
    unitAmount: p.unit_amount,
    interval: p.recurring.interval,
    currency: p.currency,
    active: p.active,
  };
}
function discountSummary(p) {
  const c = p.promotion.coupon;
  return {
    id: p.id,
    name: c.name || p.code,
    code: p.code,
    active: p.active && c.valid,
    percentOff: c.percent_off,
    amountOff: c.amount_off,
    currency: c.currency ?? null,
    duration: c.duration,
    timesRedeemed: p.times_redeemed,
    maxRedemptions: p.max_redemptions,
    expiresAt: p.expires_at,
  };
}
async function rpc(admin, name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error)
    throw new Error(
      /^billing_[a-z_]+$/.test(error.message ?? '') ? error.message : 'billing_state_unavailable',
    );
  return data;
}
async function couponForCode(stripe, code) {
  const coupon = code.promotion?.coupon;
  return typeof coupon === 'string' ? stripe.coupons.retrieve(coupon) : coupon;
}
async function listCatalog(stripe, productId, input) {
  const [prices, codes] = await Promise.all([
    stripe.prices.list({
      product: productId,
      type: 'recurring',
      limit: 100,
      ...(input.priceCursor ? { starting_after: input.priceCursor } : {}),
    }),
    stripe.promotionCodes.list({
      limit: 100,
      expand: ['data.promotion.coupon'],
      ...(input.discountCursor ? { starting_after: input.discountCursor } : {}),
    }),
  ]);
  return {
    prices: prices.data.filter((p) => ownsPrice(p, productId)).map(priceSummary),
    discounts: codes.data
      .filter((p) => ownsCoupon(p.promotion?.coupon, productId))
      .map(discountSummary),
    priceCursor: prices.has_more ? prices.data.at(-1).id : null,
    discountCursor: codes.has_more ? codes.data.at(-1).id : null,
  };
}
async function mutateCatalog(stripe, productId, input) {
  const opts = (step) => ({ idempotencyKey: `safebus:catalog:${input.requestId}:${step}` });
  if (input.action === 'create_price') {
    // lookup_key stays unique even after Stripe's idempotency retention expires.
    const lookup = `safebus_${input.requestId.replaceAll('-', '')}`;
    const existing = await stripe.prices.list({
      product: productId,
      lookup_keys: [lookup],
      limit: 2,
    });
    if (existing.data.length) return { id: existing.data[0].id };
    const price = await stripe.prices.create(
      {
        product: productId,
        nickname: input.name,
        unit_amount: input.unitAmount,
        currency: 'cad',
        recurring: { interval: input.interval, usage_type: 'licensed' },
        billing_scheme: 'per_unit',
        lookup_key: lookup,
      },
      opts('price'),
    );
    return { id: price.id };
  }
  if (input.action === 'set_price_active') {
    const price = await stripe.prices.retrieve(input.id);
    if (!ownsPrice(price, productId)) throw new Error('billing_catalog_resource_forbidden');
    await stripe.prices.update(input.id, { active: input.active }, opts('price-active'));
    return { id: input.id };
  }
  if (input.action === 'set_discount_active') {
    const code = await stripe.promotionCodes.retrieve(input.id);
    if (!ownsCoupon(await couponForCode(stripe, code), productId))
      throw new Error('billing_catalog_resource_forbidden');
    await stripe.promotionCodes.update(input.id, { active: input.active }, opts('code-active'));
    return { id: input.id };
  }
  const couponId = `safebus_${input.requestId.replaceAll('-', '')}`;
  let coupon;
  try {
    coupon = await stripe.coupons.retrieve(couponId);
  } catch (error) {
    if (error.code !== 'resource_missing') throw error;
  }
  if (!coupon) {
    if (input.expiresAt && input.expiresAt <= Math.floor(Date.now() / 1000))
      throw new Error('billing_discount_expired');
    coupon = await stripe.coupons.create(
      {
        id: couponId,
        name: input.name,
        duration: input.duration,
        applies_to: { products: [productId] },
        ...(input.kind === 'percent'
          ? { percent_off: input.value }
          : { amount_off: input.value, currency: 'cad' }),
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiresAt ? { redeem_by: input.expiresAt } : {}),
      },
      opts('coupon'),
    );
  }
  if (!ownsCoupon(coupon, productId)) throw new Error('billing_catalog_resource_forbidden');
  const existing = await stripe.promotionCodes.list({
    coupon: couponId,
    code: input.code,
    limit: 2,
  });
  if (existing.data.length) return { id: existing.data[0].id };
  const code = await stripe.promotionCodes.create(
    {
      promotion: { type: 'coupon', coupon: couponId },
      code: input.code,
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
    },
    opts('code'),
  );
  return { id: code.id };
}

export async function handler(event) {
  let ctx,
    input,
    claimed = false;
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    try {
      input = validateCatalogInput(JSON.parse(event.body || '{}'));
    } catch {
      /* Invalid JSON. */
    }
    if (!input)
      return json(400, { error: 'Enter valid pricing or discount details.', retryable: false });
    ctx = await requireBillingCaller(event, ['platform_super_admin'], {
      recentAuth: actions.includes(input.action),
      rateLimitAction: actions.includes(input.action) ? 'billing_mutation' : 'billing_read',
      rateLimitMax: 20,
    });
    if (ctx.error) return ctx.error;
    if (!ctx.config.stripeProductId)
      return json(503, { error: 'The SafeBus Stripe product is not configured.' });
    if (input.action === 'pending_request')
      return json(200, {
        pending: await rpc(ctx.admin, 'billing_get_pending_catalog_operation', {
          p_actor_id: ctx.caller.id,
        }),
      });
    const stripe = createStripeClient();
    const product = await stripe.products.retrieve(ctx.config.stripeProductId);
    if (product.deleted || !product.active)
      return json(409, {
        error: 'Activate the configured SafeBus product in Stripe before managing its catalog.',
      });
    if (input.action === 'list') return json(200, await listCatalog(stripe, product.id, input));
    const claim = await rpc(ctx.admin, 'billing_claim_catalog_operation', {
      p_request_id: input.requestId,
      p_actor_id: ctx.caller.id,
      p_action: input.action,
      p_hash: requestHash({ productId: product.id, ...input }),
      p_payload: input,
    });
    if (claim.replayed) return json(200, { ...claim.response, replayed: true });
    claimed = true;
    const result = await mutateCatalog(stripe, product.id, input);
    await rpc(ctx.admin, 'billing_finish_catalog_operation', {
      p_request_id: input.requestId,
      p_actor_id: ctx.caller.id,
      p_response: result,
    });
    return json(200, result);
  } catch (error) {
    if (!actions.includes(input?.action))
      return json(503, { error: 'Unable to load the pricing catalog. Refresh and try again.' });
    const definitive =
      error.type === 'StripeInvalidRequestError' ||
      [
        'billing_catalog_resource_forbidden',
        'billing_discount_expired',
        'billing_request_conflict',
      ].includes(error.message);
    const response = {
      error: definitive
        ? 'Stripe rejected this catalog change. Check the amount, code, expiry, and redemption limits.'
        : 'The catalog change is awaiting confirmation. Retry the original request shortly.',
      retryable: !definitive,
    };
    if (claimed && definitive) {
      try {
        await rpc(ctx.admin, 'billing_finish_catalog_operation', {
          p_request_id: input.requestId,
          p_actor_id: ctx.caller.id,
          p_response: response,
        });
      } catch {
        return json(502, {
          error: 'Confirmation is delayed. Retry the original request.',
          retryable: true,
        });
      }
    }
    console.error(
      JSON.stringify({ event: 'pricing_catalog_failed', errorCode: safeProviderErrorCode(error) }),
    );
    return json(definitive ? 409 : 502, response);
  }
}
