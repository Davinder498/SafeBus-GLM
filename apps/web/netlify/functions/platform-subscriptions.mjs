import {
  EMAIL_PATTERN,
  UUID_PATTERN,
  clean,
  createStripeClient,
  getInternalBillingState,
  json,
  requestHash,
  requireBillingCaller,
  retrieveCanonicalSubscription,
  safeProviderErrorCode,
  serverConfig,
  syncSubscriptionProjection,
  validateApprovedPrice,
  writeBillingAudit,
} from './billing-shared.mjs';

const MUTATION_ACTIONS = new Set(['create', 'update', 'schedule_cancel', 'resume', 'reconcile']);

function optionalText(value, maxLength) {
  const normalized = clean(value);
  if (!normalized) return null;
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return undefined;
  return normalized;
}

function optionalFutureDate(value) {
  const normalized = clean(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed) || parsed <= Date.now()) return undefined;
  return new Date(parsed).toISOString();
}

export function validateMutationInput(body) {
  const action = clean(body?.action);
  const requestId = clean(body?.requestId).toLowerCase();
  const tenantId = clean(body?.tenantId).toLowerCase();
  if (
    !MUTATION_ACTIONS.has(action) ||
    !UUID_PATTERN.test(requestId) ||
    !UUID_PATTERN.test(tenantId)
  ) {
    return null;
  }

  const normalized = { action, requestId, tenantId };
  if (action === 'create' || action === 'update') {
    const billingEmail = clean(body.billingEmail).toLowerCase();
    const priceId = clean(body.priceId);
    const licensedBusCount = Number(body.licensedBusCount);
    const daysUntilDue = Number(body.daysUntilDue ?? 30);
    const purchaseOrderReference = optionalText(body.purchaseOrderReference, 100);
    const trialEnd = optionalFutureDate(body.trialEnd);
    if (
      !EMAIL_PATTERN.test(billingEmail) ||
      billingEmail.length > 320 ||
      !/^price_[A-Za-z0-9]+$/.test(priceId) ||
      !Number.isSafeInteger(licensedBusCount) ||
      licensedBusCount < 0 ||
      licensedBusCount > 10_000 ||
      !Number.isInteger(daysUntilDue) ||
      daysUntilDue < 1 ||
      daysUntilDue > 90 ||
      purchaseOrderReference === undefined ||
      trialEnd === undefined ||
      typeof body.autoRenew !== 'boolean'
    ) {
      return null;
    }
    return {
      ...normalized,
      billingEmail,
      priceId,
      licensedBusCount,
      daysUntilDue,
      purchaseOrderReference,
      trialEnd,
      autoRenew: body.autoRenew,
    };
  }
  return normalized;
}

async function listApprovedPrices(stripe, productId) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: 'recurring',
    limit: 100,
    expand: ['data.product'],
  });
  return prices.data
    .filter(
      (price) =>
        price.currency === 'cad' &&
        price.recurring?.interval === 'year' &&
        price.recurring?.usage_type === 'licensed' &&
        Number.isSafeInteger(price.unit_amount),
    )
    .map((price) => ({
      id: price.id,
      name:
        clean(price.nickname) ||
        (typeof price.product === 'string'
          ? 'SafeBus annual subscription'
          : clean(price.product?.name) || 'SafeBus annual subscription'),
      currency: price.currency,
      unitAmount: price.unit_amount,
      interval: 'year',
    }));
}

function unixSeconds(iso) {
  return iso ? Math.floor(Date.parse(iso) / 1000) : undefined;
}

async function createSubscription(ctx, stripe, input, state) {
  if (state.external_subscription_id) throw new Error('billing_subscription_already_exists');
  if (input.licensedBusCount < (Number(state.active_bus_count) || 0)) {
    throw new Error('billing_quantity_below_usage');
  }
  await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId);

  const customerDetails = {
    name: state.tenant_name,
    email: input.billingEmail,
    metadata: {
      safebus_tenant_id: input.tenantId,
      safebus_purchase_order_reference: input.purchaseOrderReference ?? '',
    },
  };
  const customer = state.external_customer_id
    ? await stripe.customers.update(state.external_customer_id, customerDetails, {
        idempotencyKey: `safebus:${input.requestId}:customer-update`,
      })
    : await stripe.customers.create(customerDetails, {
        idempotencyKey: `safebus:${input.requestId}:customer`,
      });

  const { error: mappingError } = await ctx.admin.rpc('billing_upsert_customer_mapping', {
    p_tenant_id: input.tenantId,
    p_customer_id: customer.id,
    p_billing_email: input.billingEmail,
    p_purchase_order_reference: input.purchaseOrderReference,
    p_days_until_due: input.daysUntilDue,
  });
  if (mappingError) throw new Error('billing_customer_mapping_failed');

  const parameters = {
    customer: customer.id,
    items: [{ price: input.priceId, quantity: input.licensedBusCount }],
    collection_method: 'send_invoice',
    days_until_due: input.daysUntilDue,
    cancel_at_period_end: !input.autoRenew,
    metadata: { safebus_tenant_id: input.tenantId },
    expand: ['customer', 'items.data.price.product', 'latest_invoice'],
  };
  const trialEnd = unixSeconds(input.trialEnd);
  if (trialEnd) parameters.trial_end = trialEnd;

  return stripe.subscriptions.create(parameters, {
    idempotencyKey: `safebus:${input.requestId}:subscription`,
  });
}

async function updateSubscription(ctx, stripe, input, state) {
  if (!state.external_subscription_id || !state.external_customer_id) {
    throw new Error('billing_subscription_not_configured');
  }
  if (input.licensedBusCount < (Number(state.active_bus_count) || 0)) {
    throw new Error('billing_quantity_below_usage');
  }
  await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId);

  await stripe.customers.update(
    state.external_customer_id,
    {
      email: input.billingEmail,
      metadata: {
        safebus_tenant_id: input.tenantId,
        safebus_purchase_order_reference: input.purchaseOrderReference ?? '',
      },
    },
    { idempotencyKey: `safebus:${input.requestId}:customer-update` },
  );

  const existing = await retrieveCanonicalSubscription(stripe, state.external_subscription_id);
  const item = existing.items.data[0];
  if (!item) throw new Error('billing_subscription_item_count');
  const parameters = {
    items: [{ id: item.id, price: input.priceId, quantity: input.licensedBusCount }],
    days_until_due: input.daysUntilDue,
    cancel_at_period_end: !input.autoRenew,
    proration_behavior: 'none',
    metadata: { safebus_tenant_id: input.tenantId },
    expand: ['customer', 'items.data.price.product', 'latest_invoice'],
  };
  const trialEnd = unixSeconds(input.trialEnd);
  if (trialEnd) parameters.trial_end = trialEnd;

  return stripe.subscriptions.update(state.external_subscription_id, parameters, {
    idempotencyKey: `safebus:${input.requestId}:subscription-update`,
  });
}

async function changeRenewal(stripe, input, state, cancelAtPeriodEnd) {
  if (!state.external_subscription_id) throw new Error('billing_subscription_not_configured');
  return stripe.subscriptions.update(
    state.external_subscription_id,
    {
      cancel_at_period_end: cancelAtPeriodEnd,
      expand: ['customer', 'items.data.price.product', 'latest_invoice'],
    },
    { idempotencyKey: `safebus:${input.requestId}:${input.action}` },
  );
}

function auditAction(action, input, state) {
  if (action === 'update' && input.licensedBusCount !== state.licensed_bus_count) {
    return 'billing.quantity_changed';
  }
  return {
    create: 'billing.subscription_created',
    update: 'billing.subscription_updated',
    schedule_cancel: 'billing.cancellation_scheduled',
    resume: 'billing.renewal_resumed',
    reconcile: 'billing.subscription_reconciled',
  }[action];
}

export async function handler(event) {
  let requestId = null;
  let ctx = null;
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    const isPriceList = body.action === 'list_prices';
    ctx = await requireBillingCaller(event, ['platform_super_admin'], {
      recentAuth: !isPriceList,
      rateLimitAction: isPriceList ? 'billing_read' : 'billing_mutation',
      rateLimitMax: isPriceList ? 60 : 20,
    });
    if (ctx.error) return ctx.error;

    if (!ctx.config.stripeProductId) {
      return json(503, { error: 'Billing is not configured.' });
    }
    const stripe = createStripeClient();
    if (isPriceList) {
      const prices = await listApprovedPrices(stripe, ctx.config.stripeProductId);
      return json(200, { prices });
    }

    const input = validateMutationInput(body);
    if (!input) return json(400, { error: 'Review the subscription details and try again.' });
    requestId = input.requestId;
    const state = await getInternalBillingState(ctx.admin, input.tenantId);
    const hash = requestHash(input);
    const { data: idempotency, error: idempotencyError } = await ctx.admin.rpc(
      'billing_begin_mutation',
      {
        p_request_id: input.requestId,
        p_actor_profile_id: ctx.caller.id,
        p_tenant_id: input.tenantId,
        p_action: input.action,
        p_request_hash: hash,
      },
    );
    if (idempotencyError) return json(409, { error: 'This request identifier cannot be reused.' });
    if (idempotency?.should_process === false) return json(200, { ok: true, replayed: true });

    let subscription;
    if (input.action === 'create') {
      subscription = await createSubscription(ctx, stripe, input, state);
    } else if (input.action === 'update') {
      subscription = await updateSubscription(ctx, stripe, input, state);
    } else if (input.action === 'schedule_cancel') {
      subscription = await changeRenewal(stripe, input, state, true);
    } else if (input.action === 'resume') {
      subscription = await changeRenewal(stripe, input, state, false);
    } else {
      if (!state.external_subscription_id) throw new Error('billing_subscription_not_configured');
      subscription = await retrieveCanonicalSubscription(stripe, state.external_subscription_id);
    }

    const result = await syncSubscriptionProjection(ctx.admin, stripe, subscription);
    await writeBillingAudit(
      ctx.admin,
      ctx.caller.id,
      auditAction(input.action, input, state),
      input.tenantId,
      {
        status: result.status,
        licensed_bus_count:
          'licensedBusCount' in input ? input.licensedBusCount : state.licensed_bus_count,
      },
    );
    await ctx.admin.rpc('billing_complete_mutation', {
      p_request_id: input.requestId,
      p_status: 'completed',
      p_error_code: null,
    });
    return json(200, { ok: true, status: result.status });
  } catch (error) {
    const code = safeProviderErrorCode(error);
    if (ctx?.admin && requestId) {
      await ctx.admin
        .rpc('billing_complete_mutation', {
          p_request_id: requestId,
          p_status: 'failed',
          p_error_code: code,
        })
        .catch(() => undefined);
    }
    console.error(JSON.stringify({ event: 'platform_subscription_failed', errorCode: code }));
    if (code === 'billing_quantity_below_usage') {
      return json(409, { error: 'The bus allowance cannot be below current active-bus usage.' });
    }
    if (code === 'billing_subscription_already_exists') {
      return json(409, { error: 'This tenant already has a subscription.' });
    }
    if (code === 'billing_subscription_not_configured') {
      return json(409, { error: 'This tenant does not have a subscription yet.' });
    }
    if (code.includes('not_configured')) return json(503, { error: 'Billing is not configured.' });
    return json(502, { error: 'The billing provider could not confirm this change. Try again.' });
  }
}
