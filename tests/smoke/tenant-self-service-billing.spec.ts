import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tenantId = '10000000-0000-4000-8000-000000000001';
const user = {
  id: '20000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-10-01T00:00:00Z',
};
async function installBilling(page: Page, subscribed = false) {
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
              ? { pending: null }
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
        role: 'tenant_admin',
        status: 'active',
        full_name: 'Tenant Administrator',
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
        trial_eligible: !subscribed,
        billing_interval: 'month',
        collection_method: 'charge_automatically',
        price_id: subscribed ? 'price_month' : null,
        currency: 'cad',
        unit_amount: 2500,
        period_total: 5000,
        trial_end: '2026-11-01T00:00:00Z',
        current_period_end: '2026-11-01T00:00:00Z',
        bus_access: { eligible: subscribed, limit: subscribed ? 2 : null, active: 0 },
      };
    else if (url.pathname.endsWith('/get_bus_subscription_access'))
      payload = { eligible: subscribed, limit: subscribed ? 2 : null, active: 0 };
    else if (!url.pathname.includes('/rpc/')) payload = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  return requests;
}

test('new tenant selects quantity and cycle, retains checkout selection and request identity', async ({
  page,
}) => {
  const requests = await installBilling(page);
  await page.goto('/admin/settings/billing');
  await expect(page.getByRole('heading', { name: 'Start your 14-day trial' })).toBeVisible();
  await page.getByLabel('Annual', { exact: true }).check();
  await page.getByLabel('Active-bus allowance', { exact: false }).fill('3');
  await expect(page.getByText(/\$750\.00/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue to trial checkout' }).click();
  await expect(page.getByRole('alert')).toContainText('Checkout temporarily unavailable');
  const first = requests.find((r) => r.action === 'checkout');
  expect(first).toMatchObject({ quantity: 3, priceId: 'price_year' });
  expect(first).not.toHaveProperty('tenantId');
  await page.reload();
  await expect(page.getByLabel('Annual', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Active-bus allowance', { exact: false })).toHaveValue('3');
  await page.getByRole('button', { name: 'Continue to trial checkout' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests.filter((r) => r.action === 'checkout')[1].requestId).toBe(first?.requestId);
});

test('trial tenant previews a change and sees current capacity without platform controls', async ({
  page,
}) => {
  const requests = await installBilling(page, true);
  await page.goto('/admin/settings/billing');
  await expect(page.getByText('Your fleet is ready to grow')).toBeVisible();
  await page.getByLabel('Active-bus allowance', { exact: false }).fill('4');
  await page.getByRole('button', { name: 'Review change' }).click();
  await expect(page.getByRole('dialog')).toContainText('Estimated due now: $12.50');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Subscription change confirmed');
  expect(requests.filter((r) => r.action === 'change')).toHaveLength(1);
});

test('unsubscribed tenant cannot open the new bus form', async ({ page }) => {
  await installBilling(page);
  await page.goto('/admin/buses/new');
  await expect(page.getByText('A subscription is required to configure new buses')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create bus', exact: true })).toHaveCount(0);
});

test('billing is accessible on desktop and phone with no page overflow', async ({
  page,
}, testInfo) => {
  await installBilling(page);
  await page.goto('/admin/settings/billing?checkout=canceled');
  await expect(page.getByRole('status')).toContainText('Checkout canceled');
  await expect(page.getByRole('button', { name: 'Continue to trial checkout' })).toBeVisible();
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('billing.png'), fullPage: true });
});
