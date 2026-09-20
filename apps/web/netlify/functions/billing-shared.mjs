import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPABASE_TIMEOUT_MS = 12_000;
const STRIPE_TIMEOUT_MS = 15_000;

export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export function serverConfig() {
  const config = {
    supabaseUrl: clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
    supabaseKey: clean(
      process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY,
    ),
    supabaseSecret: clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    stripeSecret: clean(process.env.STRIPE_SECRET_KEY),
    stripeProductId: clean(process.env.STRIPE_SAFEBUS_PRODUCT_ID),
    stripePortalConfigurationId: clean(process.env.STRIPE_PORTAL_CONFIGURATION_ID),
    stripeWebhookSecret: clean(process.env.STRIPE_WEBHOOK_SECRET),
    appOrigin: clean(process.env.SAFEBUS_APP_ORIGIN),
  };
  return config;
}

function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export function createServerClients(token = '') {
  const config = serverConfig();
  if (!config.supabaseUrl || !config.supabaseKey || !config.supabaseSecret) {
    throw new Error('billing_supabase_not_configured');
  }

  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const user = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: fetchWithTimeout,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const admin = createClient(config.supabaseUrl, config.supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
  return { user, admin, config };
}

export function createStripeClient() {
  const config = serverConfig();
  if (!config.stripeSecret) throw new Error('billing_stripe_not_configured');
  return new Stripe(config.stripeSecret, {
    maxNetworkRetries: 2,
    timeout: STRIPE_TIMEOUT_MS,
    appInfo: { name: 'SafeBus Alberta', version: '1.0.0' },
  });
}

export async function requireBillingCaller(
  event,
  allowedRoles,
  { recentAuth = false, rateLimitAction = 'billing_read', rateLimitMax = 60 } = {},
) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: json(401, { error: 'Sign in required.' }) };

  let clients;
  try {
    clients = createServerClients(token);
  } catch {
    return { error: json(503, { error: 'Billing is not configured.' }) };
  }

  const { data: userData, error: userError } = await clients.user.auth.getUser();
  if (userError || !userData.user) {
    return { error: json(401, { error: 'Invalid session.' }) };
  }

  const { data: profile, error: profileError } = await clients.admin
    .from('profiles')
    .select('id, tenant_id, role, status, full_name, email')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.status !== 'active' ||
    !allowedRoles.includes(profile.role)
  ) {
    return { error: json(403, { error: 'You are not allowed to access billing.' }) };
  }

  const assurance = await clients.user.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (assurance.error || assurance.data.currentLevel !== 'aal2') {
    return {
      error: json(403, {
        error: 'Complete multi-factor authentication before accessing billing.',
      }),
    };
  }

  if (recentAuth) {
    const signedInAt = userData.user.last_sign_in_at
      ? Date.parse(userData.user.last_sign_in_at)
      : Number.NaN;
    if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 15 * 60 * 1000) {
      return {
        error: json(403, {
          error: 'Sign in again before changing a subscription.',
        }),
      };
    }
  }

  const rateLimit = await clients.user.rpc('check_rate_limit', {
    p_action: rateLimitAction,
    p_actor_identifier: profile.id,
    p_max: rateLimitMax,
    p_window_seconds: 60,
  });
  if (rateLimit.error || !rateLimit.data) {
    return { error: json(429, { error: 'Too many billing requests. Try again shortly.' }) };
  }

  return { ...clients, caller: profile };
}

export function requestHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function asIsoTimestamp(seconds) {
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

export function validatePortalOrigin(rawOrigin) {
  try {
    const origin = new URL(rawOrigin);
    const local = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
    if (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) return null;
    origin.pathname = '';
    origin.search = '';
    origin.hash = '';
    return origin.origin;
  } catch {
    return null;
  }
}

export async function getInternalBillingState(admin, tenantId) {
  const { data, error } = await admin.rpc('billing_get_internal_state', {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error('billing_state_unavailable');
  if (!data || typeof data !== 'object' || !data.tenant_id) {
    throw new Error('billing_tenant_not_found');
  }
  return data;
}

function subscriptionItem(subscription) {
  const items = subscription?.items?.data ?? [];
  if (items.length !== 1) throw new Error('billing_subscription_item_count');
  return items[0];
}

export async function validateApprovedPrice(stripe, priceId, productId) {
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const priceProductId = typeof price.product === 'string' ? price.product : price.product?.id;
  if (
    !price.active ||
    priceProductId !== productId ||
    price.type !== 'recurring' ||
    price.recurring?.interval !== 'year' ||
    price.recurring?.usage_type !== 'licensed' ||
    price.currency !== 'cad' ||
    !Number.isSafeInteger(price.unit_amount) ||
    price.unit_amount < 0
  ) {
    throw new Error('billing_price_not_approved');
  }
  return price;
}

export async function retrieveCanonicalSubscription(stripe, subscriptionId) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['customer', 'items.data.price.product', 'latest_invoice'],
  });
}

export async function syncSubscriptionProjection(
  admin,
  stripe,
  subscription,
  eventCreatedAt = new Date().toISOString(),
) {
  const item = subscriptionItem(subscription);
  const price = item.price;
  const product =
    typeof price.product === 'string'
      ? await stripe.products.retrieve(price.product)
      : price.product;
  const customer =
    typeof subscription.customer === 'string'
      ? await stripe.customers.retrieve(subscription.customer)
      : subscription.customer;
  if (!customer || customer.deleted) throw new Error('billing_customer_unavailable');

  const tenantId = clean(
    subscription.metadata?.safebus_tenant_id || customer.metadata?.safebus_tenant_id,
  );
  if (!UUID_PATTERN.test(tenantId)) throw new Error('billing_tenant_mapping_missing');

  const configuredProduct = serverConfig().stripeProductId;
  if (!configuredProduct || product.id !== configuredProduct) {
    throw new Error('billing_product_not_approved');
  }

  const invoice =
    typeof subscription.latest_invoice === 'string'
      ? await stripe.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice;
  const periodStart = subscription.current_period_start ?? item.current_period_start;
  const periodEnd = subscription.current_period_end ?? item.current_period_end;
  const purchaseOrder = clean(customer.metadata?.safebus_purchase_order_reference) || null;

  const { data, error } = await admin.rpc('billing_upsert_projection', {
    p_tenant_id: tenantId,
    p_customer_id: customer.id,
    p_subscription_id: subscription.id,
    p_price_id: price.id,
    p_product_name: clean(product.name) || 'SafeBus annual subscription',
    p_price_nickname: clean(price.nickname) || null,
    p_status: subscription.status,
    p_licensed_bus_count: item.quantity ?? 0,
    p_currency: price.currency,
    p_unit_amount: price.unit_amount ?? 0,
    p_period_start: asIsoTimestamp(periodStart),
    p_period_end: asIsoTimestamp(periodEnd),
    p_trial_end: asIsoTimestamp(subscription.trial_end),
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_cancel_at: asIsoTimestamp(subscription.cancel_at),
    p_canceled_at: asIsoTimestamp(subscription.canceled_at),
    p_billing_email: clean(customer.email).toLowerCase(),
    p_purchase_order_reference: purchaseOrder,
    p_days_until_due: subscription.days_until_due ?? 30,
    p_latest_invoice_status: invoice?.status ?? null,
    p_latest_invoice_due_at: asIsoTimestamp(invoice?.due_date),
    p_event_created_at: eventCreatedAt,
  });
  if (error) throw new Error('billing_projection_sync_failed');
  return { tenantId, applied: Boolean(data), status: subscription.status };
}

export function safeProviderErrorCode(error) {
  const providerCode = clean(error?.code || error?.type).toLowerCase();
  if (providerCode) {
    return providerCode.replace(/[^a-z0-9_-]/g, '_').slice(0, 80) || 'billing_provider_error';
  }
  const internalCode = clean(error?.message).toLowerCase();
  return /^billing_[a-z0-9_]+$/.test(internalCode)
    ? internalCode.slice(0, 80)
    : 'billing_provider_error';
}

export async function writeBillingAudit(admin, callerId, action, tenantId, detail = {}) {
  const { error } = await admin.rpc('write_server_audit_event', {
    p_actor_profile_id: callerId,
    p_action: action,
    p_target_type: 'tenant_subscription',
    p_target_id: tenantId,
    p_outcome: 'success',
    p_detail: detail,
  });
  if (error) throw new Error('billing_audit_failed');
}
