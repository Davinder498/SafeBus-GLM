import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBilling } from './fixtures/billing';

async function installPricing(page: Page, interrupt = false) {
  await installBilling(page, false, null, { role: 'platform_super_admin' });
  const prices = [
    {
      id: 'price_existing',
      name: 'Synthetic monthly',
      unitAmount: 2500,
      currency: 'cad',
      interval: 'month',
      active: true,
    },
  ];
  const discounts: Array<Record<string, unknown>> = [];
  const requests: Array<Record<string, unknown>> = [];
  let pending: { requestId: string; body: Record<string, unknown> } | null = null;
  let interrupted = false;
  await page.route('**/.netlify/functions/platform-pricing', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    let payload: unknown;
    if (body.action === 'list')
      payload = { prices, discounts, priceCursor: null, discountCursor: null };
    else if (body.action === 'pending_request') payload = { pending };
    else {
      if (body.action === 'create_price' && !prices.some((p) => p.id === 'price_created'))
        prices.unshift({
          id: 'price_created',
          name: String(body.name),
          unitAmount: Number(body.unitAmount),
          currency: 'cad',
          interval: String(body.interval),
          active: true,
        });
      if (body.action === 'create_discount')
        discounts.push({
          id: 'promo_created',
          name: body.name,
          code: body.code,
          active: true,
          percentOff: body.kind === 'percent' ? body.value : null,
          amountOff: body.kind === 'amount' ? body.value : null,
          currency: 'cad',
          duration: body.duration,
          timesRedeemed: 0,
          maxRedemptions: body.maxRedemptions,
          expiresAt: body.expiresAt,
        });
      if (body.action === 'set_price_active') {
        const price = prices.find((p) => p.id === body.id);
        if (price) price.active = body.active === true;
      }
      if (body.action === 'set_discount_active') {
        const discount = discounts.find((p) => p.id === body.id);
        if (discount) discount.active = body.active;
      }
      if (interrupt && !interrupted) {
        interrupted = true;
        pending = { requestId: String(body.requestId), body };
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Confirmation delayed. Retry the original request.',
            retryable: true,
          }),
        });
        return;
      }
      pending = null;
      payload = { id: body.action === 'create_discount' ? 'promo_created' : 'price_created' };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  return requests;
}

test('platform publishes and archives prices with an explicit review', async ({ page }) => {
  const requests = await installPricing(page);
  await page.goto('/admin/pricing');
  const form = page.getByRole('form', { name: 'New subscription price' });
  await form.getByLabel('Price name').fill('Synthetic annual');
  await form.getByLabel('Price per bus (CAD)').fill('240');
  await form.getByLabel('Billing interval').selectOption('year');
  await form.getByRole('button', { name: 'Review price' }).click();
  await expect(page.getByRole('dialog')).toContainText('$240.00');
  expect(requests.filter((r) => r.action === 'create_price')).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm and publish' }).click();
  await expect(page.getByRole('status')).toContainText('Catalog updated');
  expect(requests.find((r) => r.action === 'create_price')).toMatchObject({
    unitAmount: 24000,
    interval: 'year',
  });
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Synthetic annual', exact: true }) });
  await card.getByRole('button', { name: 'Archive price' }).click();
  await page.getByRole('button', { name: 'Confirm and publish' }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel('Show archived items').check();
  await expect(card).toContainText('Archived');
});

for (const kind of ['percent', 'amount'] as const)
  test(`platform creates and archives a ${kind} discount`, async ({ page }) => {
    const requests = await installPricing(page);
    await page.goto('/admin/pricing');
    const form = page.getByRole('form', { name: 'New discount' });
    await form.getByLabel('Discount name').fill('Synthetic offer');
    await form.getByLabel('Promotion code', { exact: false }).fill('qa-offer');
    await form.getByLabel('Discount type').selectOption(kind);
    await form.getByLabel(kind === 'percent' ? 'Percentage off' : 'Amount off (CAD)').fill('15');
    await form.getByLabel('Discount duration').selectOption('forever');
    await form.getByLabel('Maximum redemptions (optional)').fill('5');
    await form.getByRole('button', { name: 'Review discount' }).click();
    await expect(page.getByRole('dialog')).toContainText(kind === 'percent' ? '15%' : '$15.00');
    await page.getByRole('button', { name: 'Confirm and publish' }).click();
    await expect(page.getByRole('status')).toContainText('Catalog updated');
    expect(requests.find((r) => r.action === 'create_discount')).toMatchObject({
      code: 'QA-OFFER',
      kind,
      value: kind === 'percent' ? 15 : 1500,
      duration: 'forever',
      maxRedemptions: 5,
    });
    const card = page.getByRole('article').filter({ hasText: 'QA-OFFER' });
    await card.getByRole('button', { name: 'Archive code' }).click();
    await page.getByRole('button', { name: 'Confirm and publish' }).click();
    await expect(card).toHaveCount(0);
    await page.getByLabel('Show archived items').check();
    await expect(card).toContainText('Archived');
  });

test('catalog recovers an interrupted request after reload using its original identity', async ({
  page,
}) => {
  const requests = await installPricing(page, true);
  await page.goto('/admin/pricing');
  await page.getByLabel('Price name', { exact: true }).fill('Synthetic recovery');
  await page.getByLabel('Price per bus (CAD)').fill('25');
  await page.getByRole('button', { name: 'Review price' }).click();
  await page.getByRole('button', { name: 'Confirm and publish' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirmation delayed');
  await page.reload();
  await page.getByRole('button', { name: 'Retry catalog change' }).click();
  await expect(page.getByRole('status')).toContainText('Catalog updated');
  const writes = requests.filter((r) => r.action === 'create_price');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => /pricing|catalog/.test(key)),
    ),
  ).toEqual([]);
});

test('profile uses SafeBus branding and settings follows privacy; schools are in the sidebar', async ({
  page,
}) => {
  await installBilling(page, true);
  await page.goto('/admin/settings/billing');
  const account = page.locator('header button[aria-haspopup="menu"]');
  await expect(page.locator('header')).not.toContainText('BusSafe');
  await account.click();
  await expect(page.getByRole('menu')).toContainText('Administrator SafeBus');
  const items = await page.getByRole('menuitem').allTextContents();
  expect(items.indexOf('Settings')).toBe(items.indexOf('Privacy notice') + 1);
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  if ((page.viewportSize()?.width ?? 0) < 1024)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Primary' }).filter({ visible: true });
  await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Schools', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/schools$/);
  await expect(page.getByRole('heading', { name: 'Schools', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
});

test('test tenant has no checkout requirement and can open bus configuration', async ({ page }) => {
  await installBilling(page, false, null, { exempt: true });
  await page.goto('/admin/settings/billing');
  await expect(
    page.getByRole('heading', { name: 'Test tenant · no subscription required' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to .*checkout/ })).toHaveCount(0);
  await page.goto('/admin/buses/new');
  await expect(
    page.getByText('Test tenant · no subscription required', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Bus number (stable service number)' }),
  ).toBeVisible();
});

test('pricing is accessible and fits desktop and phone', async ({ page }, testInfo) => {
  await installPricing(page);
  await page.goto('/admin/pricing');
  await expect(
    page.getByRole('heading', { name: 'Pricing & discounts', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review price' })).toBeEnabled();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('pricing.png'), fullPage: true });
});

test('tenant admins cannot enter the platform pricing page', async ({ page }) => {
  await installBilling(page, true);
  await page.goto('/admin/pricing');
  await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review price' })).toHaveCount(0);
});
