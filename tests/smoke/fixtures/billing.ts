import type { Page } from '@playwright/test';

export const tenantId = '10000000-0000-4000-8000-000000000001';
const user = {
  id: '20000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-10-01T00:00:00Z',
};
export async function installBilling(
  page: Page,
  subscribed = false,
  pendingRequest: { requestId: string; body: Record<string, unknown> } | null = null,
  options: { role?: 'tenant_admin' | 'platform_super_admin'; exempt?: boolean } = {},
) {
  const requests: Array<Record<string, unknown>> = [];
  await page.addInitScript(
    ({ user }) => {
      const token = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ',
        'test-signature',
      ].join('.');
      const session = {
        access_token: token,
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(session));
    },
    { user },
  );
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant-invoices')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invoices: [], nextCursor: null }),
      });
      return;
    }
    if (url.pathname.endsWith('/tenant-subscriptions')) {
      const body = route.request().postDataJSON();
      requests.push(body);
      const payload =
        body.action === 'list_prices'
          ? {
              prices: [
                {
                  id: 'price_month',
                  name: 'SafeBus',
                  currency: 'cad',
                  unitAmount: 2500,
                  interval: 'month',
                },
                {
                  id: 'price_year',
                  name: 'SafeBus',
                  currency: 'cad',
                  unitAmount: 25000,
                  interval: 'year',
                },
              ],
            }
          : body.action === 'preview'
            ? { timing: 'immediate', dueNow: 1250, currency: 'cad', effectiveAt: null }
            : body.action === 'pending_request'
              ? { pending: pendingRequest }
              : body.action === 'checkout'
                ? {
                    error: 'Checkout temporarily unavailable. Retry the same request.',
                    retryable: true,
                  }
                : { ok: true };
      await route.fulfill({
        status: body.action === 'checkout' ? 502 : 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
      return;
    }
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }
    let payload: unknown = {};
    if (url.pathname.startsWith('/auth/v1/'))
      payload = url.pathname.endsWith('/user') ? user : { user };
    else if (url.pathname.includes('/profiles'))
      payload = {
        ...user,
        tenant_id: tenantId,
        role: options.role ?? 'tenant_admin',
        status: 'active',
        full_name: 'Administrator BusSafe',
        school_id: null,
        updated_at: user.created_at,
      };
    else if (url.pathname.endsWith('/get_tenant_subscription'))
      payload = {
        configured: subscribed,
        tenant_id: tenantId,
        tenant_name: 'Example Transit',
        tenant_status: 'active',
        active_bus_count: 0,
        licensed_bus_count: subscribed ? 2 : null,
        subscription_status: subscribed ? 'trialing' : null,
        trial_eligible: !subscribed && !options.exempt,
        subscription_exempt: options.exempt === true,
        billing_interval: 'month',
        collection_method: 'charge_automatically',
        price_id: subscribed ? 'price_month' : null,
        currency: 'cad',
        billing_email: 'billing@example.test',
        unit_amount: 2500,
        period_total: 5000,
        trial_end: '2026-11-01T00:00:00Z',
        current_period_end: '2026-11-01T00:00:00Z',
        bus_access: {
          eligible: subscribed || options.exempt,
          limit: options.exempt ? null : subscribed ? 2 : null,
          active: 0,
          exempt: options.exempt === true,
        },
      };
    else if (url.pathname.endsWith('/get_bus_subscription_access'))
      payload = {
        eligible: subscribed || options.exempt,
        limit: options.exempt ? null : subscribed ? 2 : null,
        active: 0,
        exempt: options.exempt === true,
      };
    else if (!url.pathname.includes('/rpc/')) payload = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  return requests;
}
