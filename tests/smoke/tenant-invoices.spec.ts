import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBilling } from './fixtures/billing';

const paid = {
  id: 'in_paid',
  number: 'SB-2026-0001',
  status: 'paid',
  currency: 'cad',
  total: 5250,
  amountPaid: 5250,
  amountRemaining: 0,
  issuedAt: '2026-10-01T12:00:00Z',
  paidAt: '2026-10-01T12:01:00Z',
  dueAt: null,
  pdfUrl: 'https://pay.stripe.com/invoice/test/pdf',
  hostedUrl: 'https://invoice.stripe.com/i/test',
};

async function mockInvoices(page: Page) {
  const billingRequests = await installBilling(page, true);
  const requests: Array<Record<string, unknown>> = [];
  let fail = false;
  await page.route('**/.netlify/functions/tenant-invoices', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      status: fail ? 502 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        fail
          ? { error: 'Invoices are temporarily unavailable. Try again.' }
          : {
              invoices: body.startingAfter
                ? [{ ...paid, id: 'in_older', number: 'SB-2025-0012' }]
                : [
                    paid,
                    {
                      ...paid,
                      id: 'in_open',
                      number: 'SB-2026-0002',
                      status: 'open',
                      amountPaid: 0,
                      amountRemaining: 5250,
                      paidAt: null,
                      dueAt: '2026-11-01T12:00:00Z',
                    },
                  ],
              nextCursor: body.startingAfter ? null : 'in_open',
            },
      ),
    });
  });
  return {
    requests,
    billingRequests,
    setFailure: (value: boolean) => {
      fail = value;
    },
  };
}

test('tenant can download paid invoice PDFs and page through prior subscription invoices', async ({
  page,
}, testInfo) => {
  const { requests } = await mockInvoices(page);
  await page.goto('/admin/settings/billing');
  await expect(page.getByRole('heading', { name: 'Invoice history', exact: true })).toBeVisible();
  const list = page.getByRole('list', { name: 'Subscription invoices' });
  await expect(list).toContainText('Paid');
  await expect(list).toContainText('Awaiting payment');
  await expect(list).toContainText('$52.50 remaining');
  const download = page.getByRole('link', {
    name: 'Download PDF for invoice SB-2026-0001',
    exact: true,
  });
  await expect(download).toHaveAttribute('href', paid.pdfUrl);
  await expect(download).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(download).toHaveAttribute('referrerpolicy', 'no-referrer');
  await download.focus();
  await expect(download).toBeFocused();
  await page.getByRole('button', { name: 'Load older invoices' }).click();
  await expect(list).toContainText('SB-2025-0012');
  expect(requests.filter((request) => request.startingAfter)).toEqual([
    { startingAfter: 'in_open' },
  ]);
  await expect(page.getByRole('button', { name: 'Load older invoices' })).toHaveCount(0);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('heading', { name: 'Invoice history', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('invoice-history.png'), fullPage: true });
  await page
    .locator('[data-ui="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Invoice history', exact: true }) })
    .screenshot({
      path: testInfo.outputPath('invoice-card.png'),
      // Keep the floating app bar outside this isolated component preview.
      style: '[data-ui="app-bar"] { visibility: hidden; }',
    });
});

test('invoice refresh failure retains documents and recovers without another payment', async ({
  page,
}) => {
  const { requests, billingRequests, setFailure } = await mockInvoices(page);
  await page.goto('/admin/settings/billing');
  await expect(page.getByRole('heading', { name: 'SB-2026-0001', exact: true })).toBeVisible();
  setFailure(true);
  await page.getByRole('button', { name: 'Refresh invoices' }).click();
  await expect(page.getByRole('alert')).toContainText('Invoices are temporarily unavailable');
  await expect(
    page.getByRole('link', { name: 'Download PDF for invoice SB-2026-0001', exact: true }),
  ).toBeVisible();
  setFailure(false);
  await page.getByRole('button', { name: 'Refresh invoices' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests.every((request) => Object.keys(request).length === 0)).toBe(true);
  expect(
    billingRequests.some((request) => ['checkout', 'change'].includes(String(request.action))),
  ).toBe(false);
});

test('empty invoice history does not imply a paid trial or an email delivery', async ({ page }) => {
  await installBilling(page, true);
  await page.goto('/admin/settings/billing');
  await expect(
    page.getByText('No finalized subscription invoices yet.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PDF', exact: false })).toHaveCount(0);
  await expect(page.getByText('Email delivered', { exact: true })).toHaveCount(0);
});

test('test tenants do not make invoice requests or see invoice controls', async ({ page }) => {
  await installBilling(page, true, null, { exempt: true });
  let requests = 0;
  await page.route('**/.netlify/functions/tenant-invoices', (route) => {
    requests++;
    return route.abort();
  });
  await page.goto('/admin/settings/billing');
  await expect(page.getByTestId('subscription-exempt')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice history', exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
});
