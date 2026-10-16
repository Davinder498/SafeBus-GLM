import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBilling, tenantId } from './fixtures/billing';

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
