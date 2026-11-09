// Approved school-authority invoice / purchase-order arrangements.
// The default path is card-funded Stripe Checkout. Invoice billing is enabled
// only for the identified tenant after a separate authenticated platform
// approval. Stripe Customer metadata holds the durable approval snapshot;
// Supabase retains a restricted audit event and the subscription projection.
import {
  UUID_PATTERN, EMAIL_PATTERN, clean, createStripeClient, getInternalBillingState,
  json, requireBillingCaller, requireDistrictBillingAgreement,
  retrieveCanonicalSubscription, safeProviderErrorCode, syncSubscriptionProjection,
  validateApprovedPrice, writeBillingAudit,
} from './billing-shared.mjs';

const APPROVED_PROVINCES = new Set([
  'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT',
]);
const POSTAL_CODE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ ]?\d[ABCEGHJ-NPRSTV-Z]\d$/;
const KEY = 'safebus_invoice_';
const financialStatuses = new Set(['trialing','active','past_due','unpaid','incomplete','paused']);
const validPriceId = (s) => /^price_[A-Za-z0-9]+$/.test(s ?? '');
const validRequestId = (s) => UUID_PATTERN.test(s ?? '');

export function validateInvoiceBillingInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const action = clean(body.action);
  const tenantId = clean(body.tenantId).toLowerCase();
  if (action === 'status') {
    if (tenantId && !validRequestId(tenantId)) return null;
    return { action, tenantId: tenantId || null };
  }
  if (action === 'review') {
    if (!validRequestId(tenantId) || !validRequestId(body.requestId) ||
        typeof body.approve !== 'boolean' || !Number.isInteger(body.daysUntilDue) ||
        body.daysUntilDue < 7 || body.daysUntilDue > 60) return null;
    return { action, tenantId, requestId: body.requestId,
      approve: body.approve, daysUntilDue: body.daysUntilDue };
  }
  if (['activate','cancel_renewal','resume_renewal'].includes(action))
    return validRequestId(body.requestId) && !tenantId
      ? { action, requestId: body.requestId } : null;
  if (action !== 'request' || tenantId || !validRequestId(body.requestId) ||
      !validPriceId(body.priceId) || !Number.isInteger(body.quantity) ||
      body.quantity < 1 || body.quantity > 10000) return null;

  const billingEmail = clean(body.billingEmail).toLowerCase();
  const purchaseOrder = clean(body.purchaseOrder);
  const rawAddress = body.address;
  if (!EMAIL_PATTERN.test(billingEmail) || billingEmail.length > 254 ||
      purchaseOrder.length > 80 || !/^[\p{L}\p{N} .,#/()_\-]*$/u.test(purchaseOrder) ||
      !rawAddress || typeof rawAddress !== 'object' || Array.isArray(rawAddress)) return null;
  const line1 = clean(rawAddress.line1);
  const city = clean(rawAddress.city);
  const state = clean(rawAddress.state).toUpperCase();
  const postalCode = clean(rawAddress.postalCode).toUpperCase().replace(/\s+/g,'');
  if (line1.length < 3 || line1.length > 200 ||
      city.length < 2 || city.length > 100 || !APPROVED_PROVINCES.has(state) ||
      !POSTAL_CODE.test(postalCode) || rawAddress.country !== 'CA') return null;
  return {
    action, requestId: body.requestId, priceId: body.priceId,
    quantity: body.quantity, billingEmail, purchaseOrder,
    address: { line1, city, state, postal_code: postalCode, country: 'CA' },
  };
}

const info = (customer) => {
  const m = customer?.metadata ?? {};
  const status = ['pending','approved','rejected','activated'].includes(m[KEY+'status'])
    ? m[KEY+'status'] : 'none';
  return {
    status,
    requestId: m[KEY+'request_id'] ?? null,
    priceId: m[KEY+'price_id'] ?? null,
    quantity: Number(m[KEY+'quantity']) || null,
    purchaseOrder: m[KEY+'po'] ?? '',
    billingEmail: customer.email ?? '',
    addressLine1: customer.address?.line1 ?? '',
    city: customer.address?.city ?? '',
    province: customer.address?.state ?? '',
    postalCode: customer.address?.postal_code ?? '',
    daysUntilDue: Number(m[KEY+'days_until_due']) || 30,
    approvedAt: m[KEY+'approved_at'] ?? null,
  };
};

async function getCustomer(stripe, state) {
  if (!state.external_customer_id) return null;
  const customer = await stripe.customers.retrieve(state.external_customer_id);
  if (!customer || customer.deleted || customer.id !== state.external_customer_id)
    throw new Error('billing_customer_unavailable');
  return customer;
}

async function ensureCustomer(ctx, stripe, state, input) {
  let customer = await getCustomer(stripe, state);
  if (!customer) {
    const created = await stripe.customers.create(
      // Use the same parameters and idempotency key as default Checkout's
      // customer creation, so a prior interrupted mapping can be recovered.
      { name: state.tenant_name, email: ctx.caller.email },
      { idempotencyKey: `safebus:tenant:${state.tenant_id}:customer` },
    );
    customer = created;
  }
  // Registered recipient / PO reference are tied to the school authority,
  // not to a driver, guardian or student's personal address.
  if (customer.metadata?.safebus_tenant_id &&
      customer.metadata.safebus_tenant_id !== state.tenant_id)
    throw new Error('billing_tenant_mapping_mismatch');
  return customer;
}

async function assertNoCurrentSubscription(stripe, customerId) {
  const history = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  if (history.has_more) throw new Error('billing_subscription_review_required');
  if (history.data.some((s) => financialStatuses.has(s.status) ||
    !['canceled','incomplete_expired'].includes(s.status)))
    throw new Error('billing_subscription_already_exists');
  const openCheckout = await stripe.checkout.sessions.list({
    customer: customerId, status: 'open', limit: 100,
  });
  if (openCheckout.has_more) throw new Error('billing_subscription_review_required');
  if (openCheckout.data.some((s) => s.mode === 'subscription'))
    throw new Error('billing_checkout_pending');
  return history;
}

function assertTenantMatch(customer, tenantId) {
  if (customer?.metadata?.[KEY+'tenant_id'] &&
      customer.metadata[KEY+'tenant_id'] !== tenantId)
    throw new Error('billing_tenant_mapping_mismatch');
}

async function requestInvoice(ctx, stripe, state, input) {
  if (state.bus_access?.exempt)
    throw new Error('billing_subscription_already_exists');
  if (input.quantity < state.active_bus_count)
    throw new Error('billing_quantity_below_usage');
  await validateApprovedPrice(stripe, input.priceId, ctx.config.stripeProductId);
  let customer = await ensureCustomer(ctx, stripe, state, input);
  await assertNoCurrentSubscription(stripe, customer.id);
  assertTenantMatch(customer, state.tenant_id);
  const existing = info(customer);
  if (existing.requestId === input.requestId && existing.status !== 'none') {
    // A provider write can succeed when the private mapping response fails;
    // recover the original request instead of creating a second customer.
    const { error } = await ctx.admin.rpc('billing_upsert_customer_mapping', {
      p_tenant_id: state.tenant_id, p_customer_id: customer.id,
      p_billing_email: customer.email,
      p_purchase_order_reference: existing.purchaseOrder || null,
      p_days_until_due: existing.daysUntilDue,
    });
    if (error) throw new Error('billing_customer_mapping_unavailable');
    return existing;
  }
  customer = await stripe.customers.update(customer.id, {
    email: input.billingEmail,
    address: input.address,
    metadata: {
      safebus_tenant_id: state.tenant_id,
      [KEY+'tenant_id']: state.tenant_id,
      [KEY+'request_id']: input.requestId,
      [KEY+'price_id']: input.priceId,
      [KEY+'quantity']: String(input.quantity),
      [KEY+'po']: input.purchaseOrder,
      // Canonical key used by existing Stripe->Supabase billing projection.
      safebus_purchase_order_reference: input.purchaseOrder,
      [KEY+'status']: 'pending',
      [KEY+'approved_by']: '',
      [KEY+'approved_at']: '',
      [KEY+'days_until_due']: '30',
    },
  }, { idempotencyKey: `safebus:invoice:${state.tenant_id}:${input.requestId}:request` });
  const { error } = await ctx.admin.rpc('billing_upsert_customer_mapping', {
    p_tenant_id: state.tenant_id, p_customer_id: customer.id,
    p_billing_email: input.billingEmail,
    p_purchase_order_reference: input.purchaseOrder || null,
    p_days_until_due: 30,
  });
  if (error) throw new Error('billing_customer_mapping_unavailable');
  await writeBillingAudit(ctx.admin, ctx.caller.id, 'billing.subscription_updated', state.tenant_id,
    { invoiceArrangement: 'requested' });
  return info(customer);
}

async function reviewInvoice(ctx, stripe, state, input) {
  if (state.tenant_status !== 'active' || state.bus_access?.exempt)
    throw new Error('billing_invoice_review_required');
  let customer = await getCustomer(stripe, state);
  if (!customer) throw new Error('billing_invoice_request_missing');
  assertTenantMatch(customer, state.tenant_id);
  const current = info(customer);
  if (current.requestId !== input.requestId)
    throw new Error('billing_invoice_review_required');
  // A Stripe metadata update may succeed before its audit response reaches
  // SafeBus. Allow a same-actor replay to complete audit without a new approval.
  const targetStatus = input.approve ? 'approved' : 'rejected';
  if (current.status === targetStatus &&
      (!input.approve || customer.metadata?.[KEY+'approved_by'] === ctx.caller.id) &&
      current.daysUntilDue === input.daysUntilDue) {
    await writeBillingAudit(ctx.admin, ctx.caller.id,
      'billing.subscription_updated',
      state.tenant_id, { invoiceArrangement: input.approve ? 'approved' : 'rejected',
        invoiceDaysUntilDue: input.daysUntilDue });
    return current;
  }
  if (current.status !== 'pending') throw new Error('billing_invoice_review_required');
  await assertNoCurrentSubscription(stripe, customer.id);
  await validateApprovedPrice(stripe, current.priceId, ctx.config.stripeProductId);
  customer = await stripe.customers.update(customer.id, {
    metadata: {
      [KEY+'status']: input.approve ? 'approved' : 'rejected',
      [KEY+'approved_by']: input.approve ? ctx.caller.id : '',
      [KEY+'approved_at']: input.approve ? new Date().toISOString() : '',
      [KEY+'days_until_due']: String(input.daysUntilDue),
    },
  }, { idempotencyKey: `safebus:invoice:${state.tenant_id}:${input.requestId}:${input.approve?'approve':'reject'}` });
  await writeBillingAudit(ctx.admin, ctx.caller.id,
    'billing.subscription_updated', state.tenant_id,
    { invoiceArrangement: input.approve ? 'approved' : 'rejected',
        invoiceDaysUntilDue: input.daysUntilDue });
  return info(customer);
}

async function activateInvoice(ctx, stripe, state, input) {
  if (state.tenant_status !== 'active' || state.bus_access?.exempt)
    throw new Error('billing_invoice_review_required');
  let customer = await getCustomer(stripe, state);
  if (!customer) throw new Error('billing_invoice_request_missing');
  assertTenantMatch(customer, state.tenant_id);
  const current = info(customer);
  const m = customer.metadata ?? {};
  if (current.requestId !== input.requestId ||
      !['approved','activated'].includes(current.status) ||
      !validRequestId(m[KEY+'approved_by']) || !current.approvedAt ||
      !validPriceId(current.priceId) || !Number.isSafeInteger(current.quantity) ||
      current.quantity < Math.max(1,state.active_bus_count) ||
      customer.address?.country !== 'CA' ||
      !APPROVED_PROVINCES.has(customer.address.state) ||
      !POSTAL_CODE.test(customer.address.postal_code ?? '') ||
      !EMAIL_PATTERN.test(customer.email ?? ''))
    throw new Error('billing_invoice_not_approved');
  const price = await validateApprovedPrice(stripe, current.priceId, ctx.config.stripeProductId);
  if (price.tax_behavior !== 'inclusive') throw new Error('billing_price_not_approved');
  const history = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 });
  if (history.has_more) throw new Error('billing_subscription_review_required');
  const matches = history.data.filter((s) =>
    s.metadata?.safebus_invoice_request_id === input.requestId &&
    s.metadata?.safebus_tenant_id === state.tenant_id
  );
  if (history.data.some((s) =>
    !['canceled','incomplete_expired'].includes(s.status) && !matches.some((matched)=>matched.id===s.id)))
    throw new Error('billing_subscription_already_exists');
  if (matches.length > 1 || (matches.length &&
      !['trialing','active','past_due','unpaid'].includes(matches[0].status)))
    throw new Error('billing_subscription_review_required');
  if (!matches.length) {
    if (current.status !== 'approved') throw new Error('billing_invoice_review_required');
    const sessions = await stripe.checkout.sessions.list({customer:customer.id,status:'open',limit:100});
    if (sessions.has_more || sessions.data.some((s) => s.mode === 'subscription'))
      throw new Error('billing_checkout_pending');
  }
  const { data: mapping, error: mappingError } = await ctx.admin.rpc('billing_find_customer', {
    p_customer_id: customer.id,
  });
  if (mappingError || mapping?.tenant_id !== state.tenant_id)
    throw new Error('billing_tenant_mapping_mismatch');
  const trial = !mapping.trial_used && history.data.length === 0;
  // Stripe invoice PDFs must carry a school authority's PO when provided,
  // not merely keep it in internal metadata. Preserve unrelated custom fields.
  const otherFields = (customer.invoice_settings?.custom_fields ?? [])
    .filter((field) => field.name !== 'Purchase order');
  const customFields = current.purchaseOrder
    ? [...otherFields, { name: 'Purchase order', value: current.purchaseOrder }]
    : otherFields;
  if (customFields.length > 4) throw new Error('billing_invoice_review_required');
  customer = await stripe.customers.update(customer.id, {
    invoice_settings: { custom_fields: customFields },
    metadata: { safebus_purchase_order_reference: current.purchaseOrder },
  }, { idempotencyKey: `safebus:invoice:${state.tenant_id}:${input.requestId}:invoice-fields` });
  // A first-time approved PO authority receives the same one 14-day trial as
  // the card path. No payment method is required for this separately approved
  // enterprise exception; Stripe issues the invoice for payment when trial ends.
  let sub = matches[0];
  if (!sub) {
    sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{price:current.priceId,quantity:current.quantity}],
      collection_method: 'send_invoice',
      days_until_due: current.daysUntilDue,
      automatic_tax: { enabled: true },
      ...(trial ? { trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'create_invoice' } } } : {}),
      metadata: {
        safebus_tenant_id: state.tenant_id,
        safebus_invoice_request_id: input.requestId,
        safebus_purchase_order_reference: current.purchaseOrder,
      },
      expand: ['customer','items.data.price.product','latest_invoice'],
    }, {idempotencyKey:`safebus:invoice:${state.tenant_id}:${input.requestId}:subscription`});
  }
  sub = await retrieveCanonicalSubscription(stripe, sub.id);
  if (sub.collection_method !== 'send_invoice' ||
      sub.metadata?.safebus_invoice_request_id !== input.requestId ||
      sub.metadata?.safebus_tenant_id !== state.tenant_id)
    throw new Error('billing_invoice_review_required');
  const projection = await syncSubscriptionProjection(ctx.admin, stripe, sub);
  if (!projection.applied) throw new Error('billing_projection_not_applied');
  if (current.status !== 'activated') {
    customer = await stripe.customers.update(customer.id, {
      metadata: { [KEY+'status']: 'activated' },
    }, {idempotencyKey:`safebus:invoice:${state.tenant_id}:${input.requestId}:activated`});
    await writeBillingAudit(ctx.admin, ctx.caller.id, 'billing.subscription_created',
      state.tenant_id, { invoiceArrangement: 'activated',
        trialGranted: trial, paymentCollection: 'send_invoice' });
  }
  return { status: 'activated', subscriptionStatus: sub.status,
    trialGranted: sub.status === 'trialing' || (trial && matches.length === 0) };
}


async function manageInvoiceRenewal(ctx, stripe, state, input) {
  if (!state.external_subscription_id || state.tenant_status !== 'active')
    throw new Error('billing_invoice_review_required');
  const customer = await getCustomer(stripe, state);
  if (!customer) throw new Error('billing_invoice_request_missing');
  assertTenantMatch(customer, state.tenant_id);
  const current = info(customer);
  if (current.status !== 'activated' || !validRequestId(current.requestId))
    throw new Error('billing_invoice_not_approved');
  const sub = await retrieveCanonicalSubscription(stripe, state.external_subscription_id);
  if (sub.collection_method !== 'send_invoice' ||
      sub.metadata?.safebus_tenant_id !== state.tenant_id ||
      sub.metadata?.safebus_invoice_request_id !== current.requestId ||
      !['trialing','active','past_due','unpaid'].includes(sub.status))
    throw new Error('billing_invoice_review_required');
  const cancel = input.action === 'cancel_renewal';
  if (sub.cancel_at_period_end === cancel) return {
    ok: true, cancelAtPeriodEnd: cancel,
  };
  const next = await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: cancel,
    expand: ['customer','items.data.price.product','latest_invoice'],
  }, { idempotencyKey: \`safebus:invoice:\${state.tenant_id}:\${input.requestId}:renewal:\${cancel?'cancel':'keep'}\` });
  const projection = await syncSubscriptionProjection(ctx.admin, stripe, next);
  if (!projection.applied) throw new Error('billing_projection_not_applied');
  await writeBillingAudit(ctx.admin, ctx.caller.id,
    cancel ? 'billing.cancellation_scheduled' : 'billing.renewal_resumed',
    state.tenant_id);
  return { ok: true, cancelAtPeriodEnd: cancel };
}

export async function handler(event) {
  let input;
  try {
    if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed.'});
    if (!event.body || event.body.length > 4096) return json(400,{error:'Invalid invoice request.'});
    try { input = validateInvoiceBillingInput(JSON.parse(event.body)); }
    catch { return json(400,{error:'Invalid invoice request.'}); }
    if (!input) return json(400,{error:'Invalid billing details.'});
    const platform = input.action === 'review' ||
      (input.action === 'status' && Boolean(input.tenantId));
    const ctx = await requireBillingCaller(event,
      [platform ? 'platform_super_admin' : 'tenant_admin'], {
        recentAuth: input.action !== 'status',
        rateLimitAction: 'billing_mutation', rateLimitMax: 20,
      });
    if (ctx.error) return ctx.error;
    const tenantId = platform ? input.tenantId : ctx.caller.tenant_id;
    if (!tenantId || !UUID_PATTERN.test(tenantId))
      return json(403,{error:'School authority access required.'});
    const state = await getInternalBillingState(ctx.admin, tenantId);
    if (state.tenant_status !== 'active')
      return json(403,{error:'School authority is unavailable.'});
    if (input.action !== 'status') {
      const agreementDenial = await requireDistrictBillingAgreement(ctx.admin, tenantId);
      if (agreementDenial) return agreementDenial;
    }
    const stripe = createStripeClient();
    if (input.action === 'status') {
      const customer = await getCustomer(stripe, state);
      if (customer) assertTenantMatch(customer, tenantId);
      return json(200,{ arrangement: customer ? info(customer) : {status:'none'} });
    }
    let result;
    if (input.action === 'request') result = await requestInvoice(ctx,stripe,state,input);
    else if (input.action === 'review') result = await reviewInvoice(ctx,stripe,state,input);
    else if (input.action === 'activate')
      result = await activateInvoice(ctx,stripe,state,input);
    else result = await manageInvoiceRenewal(ctx,stripe,state,input);
    return json(200,['activate','cancel_renewal','resume_renewal'].includes(input.action)
      ? result : {arrangement:result});
  } catch (error) {
    const code = safeProviderErrorCode(error);
    const denied = new Map([
      ['billing_invoice_request_missing','No invoice request is available.'],
      ['billing_invoice_not_approved','Invoice billing has not been approved for this selection.'],
      ['billing_invoice_review_required','The invoice arrangement needs review. Refresh its status.'],
      ['billing_subscription_already_exists','A subscription already exists for this school authority.'],
      ['billing_checkout_pending','Finish or cancel the existing Checkout before using invoice billing.'],
      ['billing_quantity_below_usage','The bus count cannot be below current active buses.'],
      ['billing_tenant_mapping_mismatch','The school authority billing account needs review.'],
      ['billing_price_not_approved','The selected price is not approved.'],
    ]);
    console.error(JSON.stringify({event:'invoice_billing_failed',action:input?.action||'unknown',errorCode:code}));
    return json(denied.has(code) ? 409 : 503,{
      error:denied.get(code)||'Invoice billing could not be verified. Refresh and retry.',
      retryable: code==='billing_provider_error',
    });
  }
}
