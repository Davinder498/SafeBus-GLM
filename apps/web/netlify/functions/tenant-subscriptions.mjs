import {
  UUID_PATTERN,
  clean,
  createStripeClient,
  getInternalBillingState,
  json,
  requestHash,
  requireBillingCaller,
  retrieveCanonicalSubscription,
  safeProviderErrorCode,
  syncSubscriptionProjection,
  validateApprovedPrice,
  validatePortalOrigin,
  writeBillingAudit,
} from './billing-shared.mjs';

export function validateTenantBillingInput(body) {
  const action = clean(body?.action);
  if (['list_prices', 'refresh', 'pending_request'].includes(action)) return { action };
  if (
    !['checkout', 'preview', 'change', 'cancel', 'keep', 'unschedule'].includes(action) ||
    !UUID_PATTERN.test(body?.requestId ?? '')
  )
    return null;
  if (['checkout', 'preview', 'change'].includes(action)) {
    if (
      !/^price_[A-Za-z0-9]+$/.test(body.priceId ?? '') ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 1 ||
      body.quantity > 10000
    )
      return null;
    return { action, requestId: body.requestId, priceId: body.priceId, quantity: body.quantity };
  }
  return { action, requestId: body.requestId };
}

export async function approvedPrices(stripe, productId) {
  if (!productId) throw new Error('billing_not_configured');
  if (/^(acct|price|bpc)_/.test(productId)) throw new Error('billing_product_id_invalid');
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: 'recurring',
    limit: 100,
    expand: ['data.product'],
  });
  return prices.data
    .filter(
      (p) =>
        ['month', 'year'].includes(p.recurring?.interval) &&
        (p.recurring?.interval_count ?? 1) === 1 &&
        p.recurring?.usage_type === 'licensed' &&
        p.currency === 'cad' &&
        Number.isSafeInteger(p.unit_amount) &&
        p.unit_amount >= 0,
    )
    .map((p) => ({
      id: p.id,
      name: clean(p.nickname) || clean(p.product?.name) || 'SafeBus',
      currency: p.currency,
      unitAmount: p.unit_amount,
      interval: p.recurring.interval,
    }));
}

async function rpc(admin, name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error)
    throw new Error(
      /^billing_[a-z_]+$/.test(error.message ?? '') ? error.message : 'billing_state_unavailable',
    );
  return data;
}

async function customerForCheckout(ctx, stripe, state) {
  if (state.external_customer_id) return state.external_customer_id;
  const customer = await stripe.customers.create(
    { name: state.tenant_name, email: ctx.caller.email },
    { idempotencyKey: `safebus:tenant:${state.tenant_id}:customer` },
  );
  await rpc(ctx.admin, 'billing_upsert_customer_mapping', {
    p_tenant_id: state.tenant_id,
    p_customer_id: customer.id,
    p_billing_email: ctx.caller.email,
    p_purchase_order_reference: null,
    p_days_until_due: 30,
  });
  return customer.id;
}

async function startCheckout(ctx, stripe, state, input) {
  await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId);
  const origin = validatePortalOrigin(ctx.config.appOrigin);
  if (!origin) throw new Error('billing_not_configured');
  const customer = await customerForCheckout(ctx, stripe, state);
  const history = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
  if (history.has_more) throw new Error('billing_subscription_review_required');
  if (history.data.some((s) => !['canceled', 'incomplete_expired'].includes(s.status)))
    throw new Error('billing_subscription_already_exists');
  const { trial_used: trialUsed } = await rpc(ctx.admin, 'billing_find_customer', {
    p_customer_id: customer,
  });
  const sessions = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 });
  if (sessions.has_more) throw new Error('billing_subscription_review_required');
  for (const session of sessions.data) {
    if (session.mode !== 'subscription') continue;
    if (session.client_reference_id !== state.tenant_id)
      throw new Error('billing_subscription_review_required');
    if (
      session.metadata?.price_id === input.priceId &&
      session.metadata?.quantity === String(input.quantity)
    )
      return { url: session.url };
    await stripe.checkout.sessions.expire(
      session.id,
      {},
      { idempotencyKey: `safebus:${input.requestId}:expire:${session.id}` },
    );
  }
  const trial = !trialUsed && history.data.length === 0;
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer,
      client_reference_id: state.tenant_id,
      integration_identifier: 'safebus_checkout_hqrzftkm',
      line_items: [{ price: input.priceId, quantity: input.quantity }],
      payment_method_collection: 'always',
      // Stripe keeps business billing details with the invoice, outside SafeBus.
      billing_address_collection: 'required',
      customer_update: { name: 'auto', address: 'auto' },
      allow_promotion_codes: true,
      subscription_data: trial
        ? {
            trial_period_days: 14,
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          }
        : {},
      metadata: { price_id: input.priceId, quantity: String(input.quantity) },
      success_url: `${origin}/admin/settings/billing?checkout=success`,
      cancel_url: `${origin}/admin/settings/billing?checkout=canceled`,
    },
    { idempotencyKey: `safebus:${input.requestId}:checkout` },
  );
  return { url: session.url };
}

export function classifyChange(subscription, priceId, quantity) {
  const item = subscription.items.data[0];
  if (subscription.items.data.length !== 1) throw new Error('billing_subscription_review_required');
  if (priceId === item.price.id && quantity === item.quantity) return 'unchanged';
  return priceId !== item.price.id || quantity < item.quantity ? 'renewal' : 'immediate';
}

async function subscriptionForChange(stripe, state, retryPending = false, renewalOnly = false) {
  if (!state.external_subscription_id) throw new Error('billing_subscription_not_configured');
  const sub = await retrieveCanonicalSubscription(stripe, state.external_subscription_id);
  if (sub.collection_method !== 'charge_automatically') throw new Error('billing_legacy_contract');
  if (
    !(renewalOnly ? ['active', 'trialing', 'past_due', 'unpaid'] : ['active', 'trialing']).includes(
      sub.status,
    )
  )
    throw new Error('billing_subscription_ineligible');
  if (sub.pending_update && !retryPending && !renewalOnly)
    throw new Error('billing_payment_pending');
  if (
    sub.status === 'active' &&
    state.bus_access?.eligible !== true &&
    !retryPending &&
    !renewalOnly
  )
    throw new Error('billing_subscription_ineligible');
  return sub;
}

async function preview(stripe, sub, input) {
  const timing = classifyChange(sub, input.priceId, input.quantity);
  const effectiveAt =
    timing === 'renewal' ? (sub.items.data[0].current_period_end ?? sub.current_period_end) : null;
  if (timing !== 'immediate' || sub.status === 'trialing')
    return { timing, dueNow: 0, effectiveAt };
  const invoice = await stripe.invoices.createPreview({
    customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    subscription: sub.id,
    subscription_details: {
      items: [{ id: sub.items.data[0].id, price: input.priceId, quantity: input.quantity }],
      proration_behavior: 'always_invoice',
    },
  });
  return { timing, dueNow: invoice.amount_due, currency: invoice.currency, effectiveAt };
}

async function changeSubscription(ctx, stripe, sub, input, retry = false) {
  const timing = classifyChange(sub, input.priceId, input.quantity);
  if (timing === 'unchanged') return sub;
  if (sub.cancel_at_period_end) throw new Error('billing_resume_first');
  if (sub.schedule && !retry) throw new Error('billing_scheduled_change_exists');
  if (timing === 'renewal') {
    await rpc(ctx.admin, 'billing_reserve_capacity', {
      p_tenant_id: ctx.caller.tenant_id,
      p_request_id: input.requestId,
      p_quantity: input.quantity,
    });
    const schedule = await stripe.subscriptionSchedules.create(
      { from_subscription: sub.id },
      { idempotencyKey: `safebus:${input.requestId}:schedule` },
    );
    const phase = schedule.phases[0];
    // Reuse existing discount instances so duration/redemption is never restarted.
    const discounts = (sub.discounts ?? []).map((d) => ({
      discount: typeof d === 'string' ? d : d.id,
    }));
    await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [
          {
            start_date: phase.start_date,
            end_date: phase.end_date,
            items: [{ price: sub.items.data[0].price.id, quantity: sub.items.data[0].quantity }],
            discounts,
            ...(sub.status === 'trialing' ? { trial_end: sub.trial_end } : {}),
          },
          {
            start_date: phase.end_date,
            duration: {
              interval: (
                await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId)
              ).recurring.interval,
              interval_count: 1,
            },
            items: [{ price: input.priceId, quantity: input.quantity }],
            discounts,
            proration_behavior: 'none',
          },
        ],
      },
      { idempotencyKey: `safebus:${input.requestId}:phases` },
    );
    return retrieveCanonicalSubscription(stripe, sub.id);
  }
  return stripe.subscriptions.update(
    sub.id,
    {
      items: [{ id: sub.items.data[0].id, price: input.priceId, quantity: input.quantity }],
      ...(sub.status === 'trialing'
        ? { proration_behavior: 'none' }
        : { proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete' }),
      expand: ['customer', 'items.data.price.product', 'latest_invoice'],
    },
    { idempotencyKey: `safebus:${input.requestId}:change` },
  );
}

export async function handler(event) {
  let ctx;
  let input;
  let claimed = false;
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    input = validateTenantBillingInput(body);
    if (!input)
      return json(400, { error: 'Select a price and a whole bus quantity between 1 and 10,000.' });
    ctx = await requireBillingCaller(event, ['tenant_admin'], {
      recentAuth: !['list_prices', 'refresh', 'preview', 'pending_request'].includes(input.action),
      rateLimitAction: 'billing_mutation',
      rateLimitMax: 20,
    });
    if (ctx.error) return ctx.error;
    if (!ctx.caller.tenant_id) return json(403, { error: 'School authority assignment required.' });
    if (input.action === 'list_prices')
      return json(200, {
        prices: await approvedPrices(createStripeClient(), ctx.config.stripeProductId),
      });
    let state = await getInternalBillingState(ctx.admin, ctx.caller.tenant_id);
    if (state.tenant_status !== 'active')
      return json(403, { error: 'School authority access is suspended.' });
    if (state.bus_access?.exempt && ['checkout', 'preview', 'change'].includes(input.action))
      return json(409, {
        error: 'This test school authority does not require a subscription.',
        retryable: false,
      });
    if (state.bus_access?.exempt && input.action === 'refresh') return json(200, { ok: true });
    if (input.action === 'pending_request')
      return json(200, {
        pending: await rpc(ctx.admin, 'billing_get_pending_request', {
          p_tenant_id: ctx.caller.tenant_id,
          p_actor_id: ctx.caller.id,
        }),
      });
    const stripe = createStripeClient();
    if (input.action === 'refresh') {
      if (state.external_subscription_id)
        await syncSubscriptionProjection(
          ctx.admin,
          stripe,
          await retrieveCanonicalSubscription(stripe, state.external_subscription_id),
        );
      else if (state.external_customer_id) {
        const list = await stripe.subscriptions.list({
          customer: state.external_customer_id,
          status: 'all',
          limit: 100,
        });
        const current =
          list.data.find((s) => !['canceled', 'incomplete_expired'].includes(s.status)) ??
          list.data[0];
        if (current)
          await syncSubscriptionProjection(
            ctx.admin,
            stripe,
            await retrieveCanonicalSubscription(stripe, current.id),
          );
      }
      return json(200, { ok: true });
    }
    if (input.quantity < state.active_bus_count) throw new Error('billing_quantity_below_usage');
    if (['checkout', 'preview', 'change'].includes(input.action))
      await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId);
    if (input.action === 'preview')
      return json(200, await preview(stripe, await subscriptionForChange(stripe, state), input));
    const claim = await rpc(ctx.admin, 'billing_claim_operation', {
      p_tenant_id: ctx.caller.tenant_id,
      p_request_id: input.requestId,
      p_actor_id: ctx.caller.id,
      p_action: input.action,
      p_hash: requestHash(input),
      p_payload: input,
    });
    if (claim.replayed) return json(200, claim.response);
    claimed = true;
    state = await getInternalBillingState(ctx.admin, ctx.caller.tenant_id);
    let result;
    if (input.action === 'checkout') result = await startCheckout(ctx, stripe, state, input);
    else {
      let sub = await subscriptionForChange(
        stripe,
        state,
        claim.retry && input.action === 'change',
        input.action !== 'change',
      );
      if (input.action === 'change')
        sub = await changeSubscription(ctx, stripe, sub, input, claim.retry);
      else {
        if (sub.schedule) {
          // Cancellation replaces a future plan change, not the current paid term.
          await stripe.subscriptionSchedules.release(
            typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id,
            {},
            { idempotencyKey: `safebus:${input.requestId}:release` },
          );
        }
        sub = await stripe.subscriptions.update(
          sub.id,
          {
            cancel_at_period_end:
              input.action === 'unschedule' ? sub.cancel_at_period_end : input.action === 'cancel',
            expand: ['customer', 'items.data.price.product', 'latest_invoice'],
          },
          { idempotencyKey: `safebus:${input.requestId}:renewal` },
        );
      }
      await syncSubscriptionProjection(
        ctx.admin,
        stripe,
        sub,
        new Date().toISOString(),
        input.requestId,
      );
      result = {
        ok: true,
        pendingPayment: Boolean(sub.pending_update),
        paymentUrl: sub.pending_update ? sub.latest_invoice?.hosted_invoice_url : null,
      };
    }
    await writeBillingAudit(
      ctx.admin,
      ctx.caller.id,
      {
        checkout: 'billing.subscription_created',
        change: 'billing.subscription_updated',
        cancel: 'billing.cancellation_scheduled',
        keep: 'billing.renewal_resumed',
        unschedule: 'billing.subscription_updated',
      }[input.action],
      ctx.caller.tenant_id,
    );
    await rpc(ctx.admin, 'billing_finish_operation', {
      p_tenant_id: ctx.caller.tenant_id,
      p_request_id: input.requestId,
      p_response: result,
    });
    return json(200, result);
  } catch (error) {
    const code = safeProviderErrorCode(error);
    if (input?.action === 'list_prices') {
      const configurationFailure = [
        'resource_missing',
        'api_key_expired',
        'stripeauthenticationerror',
        'stripepermissionerror',
        'billing_stripe_not_configured',
        'billing_not_configured',
        'billing_product_id_invalid',
      ].includes(code);
      console.error(
        JSON.stringify({ event: 'tenant_billing_failed', action: input.action, errorCode: code }),
      );
      return json(503, {
        code: configurationFailure
          ? 'billing_catalog_not_configured'
          : 'billing_catalog_unavailable',
        error: configurationFailure
          ? 'Subscription options are not configured correctly. Contact SafeBus support.'
          : 'Subscription options could not be loaded. Try again shortly.',
        retryable: !configurationFailure,
      });
    }
    const messages = {
      billing_quantity_below_usage: 'Deactivate buses before choosing a smaller allowance.',
      billing_legacy_contract:
        'This existing invoice contract requires a contract review before self-service changes.',
      billing_subscription_already_exists:
        'Your subscription is already started. Refresh billing to continue.',
      billing_subscription_not_configured: 'Start your subscription first.',
      billing_subscription_ineligible: 'Resolve the subscription payment before changing capacity.',
      billing_payment_pending: 'Complete the pending payment before making another change.',
      billing_price_not_approved:
        'This subscription price is no longer available. Refresh the price list and choose another price.',
      billing_not_configured: 'Subscription checkout is not configured. Contact SafeBus support.',
      billing_resume_first: 'Resume renewal before changing your subscription.',
      billing_scheduled_change_exists:
        'Remove the scheduled change before choosing another subscription change.',
      billing_operation_busy:
        'Another billing request is processing. Wait two minutes, then retry.',
      billing_retry_original_request:
        'A previous request needs confirmation. Return to the original request and retry.',
    };
    // Once a provider call starts, keep its request key fenced until an identical retry resolves it.
    // Definitive validation failures have no provider side effects and can safely finish.
    if (
      claimed &&
      messages[code] &&
      !['billing_operation_busy', 'billing_retry_original_request'].includes(code)
    ) {
      await rpc(ctx.admin, 'billing_finish_operation', {
        p_tenant_id: ctx.caller.tenant_id,
        p_request_id: input.requestId,
        p_response: { error: messages[code], retryable: false },
      }).catch(() => undefined);
    }
    console.error(
      JSON.stringify({ event: 'tenant_billing_failed', action: input?.action, errorCode: code }),
    );
    return json(messages[code] ? 409 : 502, {
      error:
        messages[code] ??
        'Billing could not confirm this request. Your selection is saved; retry the same request in two minutes.',
      retryable:
        !messages[code] ||
        ['billing_operation_busy', 'billing_retry_original_request'].includes(code),
    });
  }
}
