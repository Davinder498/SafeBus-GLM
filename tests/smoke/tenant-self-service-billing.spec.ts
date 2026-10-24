import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBilling, tenantId } from './fixtures/billing';
import { installLocalOnlyBoundary } from './fixtures/local-only';
import { expectUsableMobileLayout } from './fixtures/responsive';

test('new-account price failure offers a real retry instead of an empty selector', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile-chromium')
    await page.setViewportSize({ width: 320, height: 568 });
  await installLocalOnlyBoundary(page);
  const requests = await installBilling(page);
  let attempts = 0;
  let catalogReady = false;
  await page.route('**/.netlify/functions/tenant-subscriptions', async (route) => {
    if (route.request().postDataJSON().action !== 'list_prices') return route.fallback();
    attempts++;
    if (catalogReady) return route.fallback();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'billing_catalog_not_configured',
        error: 'Subscription options are not configured correctly. Contact SafeBus support.',
        retryable: false,
      }),
    });
  });
  await page.goto('/admin/settings/billing');
  await expect(page.getByRole('alert')).toContainText(
    'Subscription options are not configured correctly',
  );
  await expect(page.getByLabel('Subscription price', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Contact SafeBus support' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to trial checkout' })).toHaveCount(0);
  await expectUsableMobileLayout(page);
  await page.screenshot({
    path: testInfo.outputPath('subscription-unavailable.png'),
    fullPage: true,
  });
  const initialAttempts = attempts;
  catalogReady = true;
  await page.getByRole('button', { name: 'Retry subscription options' }).click();
  await expect(page.getByLabel('Subscription price', { exact: true })).toHaveValue('price_month');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBeGreaterThan(initialAttempts);
  expect(requests.some((r) => r.action === 'checkout')).toBe(false);
  // Capture the fixed header at the top of the full-page review artifact.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('subscription-recovered.png'),
    fullPage: true,
  });
  await expectUsableMobileLayout(page);
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
    await expectUsableMobileLayout(page);
    await page.getByRole('button', { name: 'Close navigation' }).click();
  }
});

test('new account starts on the available cycle when only annual prices exist', async ({
  page,
}) => {
  await installLocalOnlyBoundary(page);
  await installBilling(page);
  await page.route('**/.netlify/functions/tenant-subscriptions', async (route) => {
    if (route.request().postDataJSON().action !== 'list_prices') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prices: [
          {
            id: 'price_year',
            name: 'SafeBus',
            unitAmount: 25000,
            currency: 'cad',
            interval: 'year',
          },
        ],
      }),
    });
  });
  await page.goto('/admin/settings/billing');
  await expect(page.getByLabel('Annual', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Monthly', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Subscription price', { exact: true })).toHaveValue('price_year');
});

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
  expect(
    await page.evaluate((id) => sessionStorage.getItem(`safebus-billing-request:${id}`), tenantId),
  ).toBe(first?.requestId);
  await page.reload();
  await expect(page.getByLabel('Annual', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Active-bus allowance', { exact: false })).toHaveValue('3');
  await page.getByRole('button', { name: 'Continue to trial checkout' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests.filter((r) => r.action === 'checkout')[1].requestId).toBe(first?.requestId);
});

test('recovers the original server request without persisting financial response data', async ({
  page,
}) => {
  const requestId = '30000000-0000-4000-8000-000000000001';
  const requests = await installBilling(page, true, {
    requestId,
    body: { quantity: 4, priceId: 'price_month', action: 'change' },
  });
  await page.goto('/admin/settings/billing');
  await page.getByRole('button', { name: 'Retry previous billing request' }).click();
  await expect(page.getByRole('status')).toContainText('Previous billing request confirmed');
  expect(requests.find((r) => r.action === 'change')).toEqual({
    action: 'change',
    priceId: 'price_month',
    quantity: 4,
    requestId,
  });
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('safebus-billing-')),
    ),
  ).toEqual([]);
});

test('trial tenant previews a change and sees current capacity without platform controls', async ({
  page,
}) => {
  await installLocalOnlyBoundary(page);
  const requests = await installBilling(page, true);
  await page.goto('/admin/settings/billing');
  await expect(page.getByText('Your fleet is ready to grow')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Configure buses' })).toHaveCount(0);
  const summary = page.getByTestId('subscription-summary');
  await expect(summary.getByText('Contracted buses', { exact: true })).toBeVisible();
  await expect(summary.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Subscription selection' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change plan', exact: true }).click();
  await page.getByLabel('Active-bus allowance', { exact: false }).fill('4');
  await page.getByRole('button', { name: 'Review change' }).click();
  await expect(page.getByRole('dialog')).toContainText('Estimated due now: $12.50');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Subscription change confirmed');
  expect(requests.filter((r) => r.action === 'change')).toHaveLength(1);
  await expect(page.getByRole('form', { name: 'Subscription selection' })).toHaveCount(0);
});

test('subscription cancellation stays in SafeBus and requires confirmation', async ({ page }) => {
  await installLocalOnlyBoundary(page);
  const requests = await installBilling(page, true);
  let cancelAtPeriodEnd = false;
  await page.route('**/rest/v1/rpc/get_tenant_subscription', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        tenant_id: tenantId,
        subscription_status: 'trialing',
        billing_interval: 'month',
        collection_method: 'charge_automatically',
        current_period_end: '2026-11-01T00:00:00Z',
        cancel_at_period_end: cancelAtPeriodEnd,
      }),
    });
  });
  await page.route('**/.netlify/functions/tenant-subscriptions', async (route) => {
    const action = route.request().postDataJSON().action;
    if (action === 'cancel') cancelAtPeriodEnd = true;
    if (action === 'keep') cancelAtPeriodEnd = false;
    await route.fallback();
  });
  await page.goto('/admin/settings/billing');
  const card = page.getByTestId('subscription-cancellation');
  await card.getByRole('button', { name: 'Cancel plan', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Existing operations continue afterward');
  expect(requests.some((r) => r.action === 'cancel')).toBe(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel renewal' }).click();
  await expect(card.getByRole('heading')).toHaveText('Plan cancellation scheduled');
  await expect(page.getByTestId('subscription-summary').getByText('Access through')).toBeVisible();
  expect(requests.filter((r) => r.action === 'cancel')).toHaveLength(1);
  await card.getByRole('button', { name: 'Resume renewal' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(card.getByRole('heading')).toHaveText('Cancel plan');
  expect(requests.filter((r) => r.action === 'keep')).toHaveLength(1);
  await expect(page).toHaveURL(/\/admin\/settings\/billing$/);
});

test('payment details opens the authenticated Stripe portal only on request', async ({ page }) => {
  await installLocalOnlyBoundary(page);
  await installBilling(page, true);
  let portalRequests = 0;
  await page.route('**/.netlify/functions/billing-portal', async (route) => {
    portalRequests++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://billing.stripe.com/p/session/synthetic' }),
    });
  });
  await page.route('https://billing.stripe.com/p/session/synthetic', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic billing portal</h1>' }),
  );
  await page.goto('/admin/settings/billing');
  await expect(page.getByRole('heading', { name: 'Payment details', exact: true })).toBeVisible();
  expect(portalRequests).toBe(0);
  await page.getByRole('button', { name: 'Manage payment details', exact: true }).click();
  await expect(page).toHaveURL('https://billing.stripe.com/p/session/synthetic');
  expect(portalRequests).toBe(1);
});

test('subscribed billing uses one details card and stays accessible on desktop and phone', async ({
  page,
}, testInfo) => {
  await installLocalOnlyBoundary(page);
  await installBilling(page, true);
  if (testInfo.project.name === 'mobile-chromium')
    await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/admin/settings/billing');
  await expect(page.getByTestId('subscription-summary')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice history' })).toBeVisible();
  await expectUsableMobileLayout(page);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
  const summary = page.getByTestId('subscription-summary');
  const label = await summary.locator('dt').first().boundingBox();
  const value = await summary.locator('dd').first().boundingBox();
  expect(label).not.toBeNull();
  expect(value).not.toBeNull();
  expect(value!.x).toBeGreaterThan(label!.x + label!.width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('subscribed-billing.png'), fullPage: true });
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
