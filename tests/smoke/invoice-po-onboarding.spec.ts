import { test, expect } from '@playwright/test';
import { installBilling } from './fixtures/billing';

test('district invoice request remains pending until separately approved, then activates one trial', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installBilling(page);
  const actions: Array<Record<string, unknown>> = [];
  let status: 'none' | 'pending' | 'approved' | 'activated' = 'none';
  let selectedId = '';
  await page.route('**/.netlify/functions/tenant-subscriptions', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action !== 'list_prices') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prices: [
          {
            id: 'price_month',
            name: 'SafeBus',
            currency: 'cad',
            unitAmount: 199,
            interval: 'month',
            taxBehavior: 'inclusive',
          },
          {
            id: 'price_year',
            name: 'SafeBus',
            currency: 'cad',
            unitAmount: 2029,
            interval: 'year',
            taxBehavior: 'inclusive',
          },
        ],
      }),
    });
  });
  await page.route('**/.netlify/functions/invoice-billing', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    actions.push(request);
    if (request.action === 'request') {
      status = 'pending';
      selectedId = String(request.requestId);
    }
    if (request.action === 'activate') {
      status = 'activated';
    }
    const payload =
      request.action === 'activate'
        ? { status: 'activated', subscriptionStatus: 'trialing', trialGranted: true }
        : {
            arrangement: {
              status,
              requestId: selectedId || null,
              priceId: 'price_month',
              quantity: 3,
              purchaseOrder: 'PO-1234',
              billingEmail: 'billing@example.test',
              daysUntilDue: 30,
            },
          };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ...payload }),
    });
  });
  await page.goto('/admin/settings/billing');
  const invoice = page.locator('[data-ui="tenant-invoice-billing"]');
  await expect(invoice.getByRole('button', { name: 'Request invoice / PO billing' })).toBeVisible();
  await invoice.getByRole('button', { name: 'Request invoice / PO billing' }).click();
  await expect(invoice.getByText(/Approval status: Not requested/)).toBeVisible();
  await invoice.getByLabel('Approved price and billing interval').selectOption('price_month');
  await invoice.getByLabel('Active bus allowance').fill('3');
  await invoice.getByLabel('School authority billing email').fill('billing@example.test');
  await invoice.getByLabel('Purchase-order reference (if issued)').fill('PO-1234');
  await invoice.getByLabel('Street / billing address').fill('100 Example Plaza');
  await invoice.getByLabel('City').fill('Edmonton');
  await invoice.getByLabel('Province or territory').selectOption('AB');
  await invoice.getByLabel('Canadian postal code').fill('T5J2N2');
  await invoice.getByRole('button', { name: 'Submit invoice billing request' }).click();
  await expect(invoice.getByText(/awaiting platform approval/)).toBeVisible();
  const submitted = actions.find((a) => a.action === 'request');
  expect(submitted).toMatchObject({
    priceId: 'price_month',
    quantity: 3,
    billingEmail: 'billing@example.test',
    purchaseOrder: 'PO-1234',
  });
  expect(actions.some((a) => a.action === 'activate')).toBe(false);
  // Simulate a separately authorized platform review: neither client-side
  // request submission nor an unapproved status can initiate billing.
  status = 'approved';
  await invoice.getByRole('button', { name: 'Refresh invoice approval' }).click();
  await expect(invoice.getByText(/Approval status: approved/)).toBeVisible();
  await invoice.getByRole('checkbox').check();
  await invoice.getByRole('button', { name: 'Activate approved invoice subscription' }).click();
  await expect(invoice.getByText(/14-day invoice trial is active/)).toBeVisible();
  expect(actions.filter((a) => a.action === 'activate')).toHaveLength(1);
  const activation = actions.find((a) => a.action === 'activate');
  expect(activation).toMatchObject({ arrangementId: selectedId });
  expect(activation?.requestId).not.toBe(selectedId);
});
