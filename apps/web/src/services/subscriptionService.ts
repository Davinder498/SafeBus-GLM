import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  PlatformBillingSummary,
  PlatformSubscriptionAction,
  SubscriptionPrice,
  SubscriptionStatus,
  TenantSubscription,
  BusSubscriptionAccess,
  BillingPreview,
} from '@/types/subscription';

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSubscription(value: unknown): TenantSubscription {
  const data = record(value);
  return {
    configured: data.configured === true,
    tenantId: text(data.tenant_id) ?? '',
    tenantName: text(data.tenant_name) ?? 'Tenant',
    tenantType: text(data.tenant_type) ?? 'school',
    tenantStatus: text(data.tenant_status) ?? 'active',
    productName: text(data.product_name),
    priceNickname: text(data.price_nickname),
    priceId: text(data.price_id),
    subscriptionStatus: text(data.subscription_status) as SubscriptionStatus | null,
    licensedBusCount: number(data.licensed_bus_count),
    activeBusCount: number(data.active_bus_count) ?? 0,
    usageExceedsAllowance: data.usage_exceeds_allowance === true,
    currency: text(data.currency),
    unitAmount: number(data.unit_amount),
    annualTotal: number(data.annual_total),
    billingInterval: data.billing_interval === 'month' ? 'month' : 'year',
    periodTotal: number(data.period_total),
    collectionMethod: text(data.collection_method),
    trialEligible: data.trial_eligible === true,
    pendingPayment: data.pending_payment === true,
    pendingChange: (data.pending_change as TenantSubscription['pendingChange']) ?? null,
    busAccess: normalizeBusAccess(data.bus_access),
    currentPeriodStart: text(data.current_period_start),
    currentPeriodEnd: text(data.current_period_end),
    trialEnd: text(data.trial_end),
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    cancelAt: text(data.cancel_at),
    canceledAt: text(data.canceled_at),
    billingEmail: text(data.billing_email),
    purchaseOrderReference: text(data.purchase_order_reference),
    daysUntilDue: number(data.days_until_due),
    latestInvoiceStatus: text(data.latest_invoice_status),
    latestInvoiceDueAt: text(data.latest_invoice_due_at),
    lastSyncedAt: text(data.last_synced_at),
    billingWarning: data.billing_warning === true,
  };
}

export async function fetchTenantSubscription(): Promise<TenantSubscription> {
  const { data, error } = await client().rpc('get_tenant_subscription');
  if (error) throw new Error('Unable to load subscription details.');
  return normalizeSubscription(data);
}

export async function fetchPlatformTenantBillingDetail(
  tenantId: string,
): Promise<TenantSubscription> {
  const { data, error } = await client().rpc('get_platform_tenant_billing_detail', {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error('Unable to load tenant billing details.');
  return normalizeSubscription(data);
}

export async function fetchPlatformBillingSummaries(): Promise<PlatformBillingSummary[]> {
  const { data, error } = await client().rpc('get_platform_subscription_summaries');
  if (error) throw new Error('Unable to load subscription summaries.');
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    tenantId: text(row.tenant_id) ?? '',
    configured: row.configured === true,
    status: text(row.subscription_status) as SubscriptionStatus | null,
    licensedBusCount: number(row.licensed_bus_count),
    activeBusCount: number(row.active_bus_count) ?? 0,
    currentPeriodEnd: text(row.current_period_end),
    trialEnd: text(row.trial_end),
    warning: row.billing_warning === true,
  }));
}

async function callBillingFunction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const c = client();
  const { data: sessionData } = await c.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.error === 'string') {
    throw Object.assign(
      new Error(
        typeof payload.error === 'string'
          ? payload.error
          : 'The billing request was not confirmed.',
      ),
      { retryable: payload.retryable },
    );
  }
  return payload as T;
}

function normalizeBusAccess(value: unknown): BusSubscriptionAccess {
  const data = record(value);
  return {
    eligible: data.eligible === true,
    limit: number(data.limit),
    active: number(data.active) ?? 0,
  };
}

export async function fetchBusSubscriptionAccess(): Promise<BusSubscriptionAccess> {
  const { data, error } = await client().rpc('get_bus_subscription_access');
  if (error) throw new Error('Unable to verify bus capacity. Refresh and try again.');
  return normalizeBusAccess(data);
}

export async function fetchTenantPrices(): Promise<SubscriptionPrice[]> {
  return (
    await callBillingFunction<{ prices: SubscriptionPrice[] }>('tenant-subscriptions', {
      action: 'list_prices',
    })
  ).prices;
}

export async function refreshTenantBilling(): Promise<void> {
  await callBillingFunction('tenant-subscriptions', { action: 'refresh' });
}

export async function previewTenantChange(
  priceId: string,
  quantity: number,
): Promise<BillingPreview> {
  return callBillingFunction('tenant-subscriptions', {
    action: 'preview',
    requestId: crypto.randomUUID(),
    priceId,
    quantity,
  });
}

export async function changeTenantBilling(
  tenantId: string,
  action: 'checkout' | 'change' | 'cancel' | 'keep' | 'unschedule',
  priceId?: string,
  quantity?: number,
): Promise<{ url?: string; pendingPayment?: boolean; paymentUrl?: string }> {
  const key = `safebus-billing-request:${tenantId}`;
  const body = { action, ...(priceId ? { priceId, quantity } : {}) };
  const saved = sessionStorage.getItem(key);
  const request = saved ? (JSON.parse(saved) as { fingerprint: string; requestId: string }) : null;
  const fingerprint = JSON.stringify(body);
  if (request && request.fingerprint !== fingerprint)
    throw new Error('Retry your previous billing request before making another change.');
  const requestId = request?.fingerprint === fingerprint ? request.requestId : crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ fingerprint, requestId }));
  let result;
  try {
    result = await callBillingFunction<{
      url?: string;
      pendingPayment?: boolean;
      paymentUrl?: string;
    }>('tenant-subscriptions', { ...body, requestId });
  } catch (error) {
    if ((error as { retryable?: boolean }).retryable === false) sessionStorage.removeItem(key);
    throw error;
  }
  sessionStorage.removeItem(key);
  return result;
}

export async function retryTenantBilling(
  tenantId: string,
): Promise<{ url?: string; pendingPayment?: boolean; paymentUrl?: string }> {
  const key = `safebus-billing-request:${tenantId}`;
  const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as {
    fingerprint: string;
    requestId: string;
  } | null;
  if (!saved) throw new Error('No billing request is awaiting confirmation.');
  let result;
  try {
    result = await callBillingFunction<{
      url?: string;
      pendingPayment?: boolean;
      paymentUrl?: string;
    }>('tenant-subscriptions', { ...JSON.parse(saved.fingerprint), requestId: saved.requestId });
  } catch (error) {
    if ((error as { retryable?: boolean }).retryable === false) sessionStorage.removeItem(key);
    throw error;
  }
  sessionStorage.removeItem(key);
  return result;
}

export async function recoverPendingTenantBilling(tenantId: string): Promise<boolean> {
  const { pending } = await callBillingFunction<{
    pending: { requestId: string; body: Record<string, unknown> } | null;
  }>('tenant-subscriptions', { action: 'pending_request' });
  if (!pending?.body) return false;
  const body = { ...pending.body };
  delete body.requestId;
  sessionStorage.setItem(
    `safebus-billing-request:${tenantId}`,
    JSON.stringify({ requestId: pending.requestId, fingerprint: JSON.stringify(body) }),
  );
  return true;
}

export async function mutatePlatformSubscription(
  action: PlatformSubscriptionAction,
  tenantId: string,
): Promise<{ ok: boolean; status?: string; replayed?: boolean }> {
  return callBillingFunction('platform-subscriptions', {
    action,
    requestId: crypto.randomUUID(),
    tenantId,
  });
}

export async function createBillingPortalSession(): Promise<string> {
  const result = await callBillingFunction<{ url: string }>('billing-portal', {});
  if (!result.url.startsWith('https://'))
    throw new Error('The billing portal returned an invalid URL.');
  return result.url;
}

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return 'Not available';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function formatBillingDate(value: string | null): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Not available'
    : new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' }).format(date);
}
