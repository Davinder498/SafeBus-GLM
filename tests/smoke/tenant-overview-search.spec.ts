import { expect, test } from '@playwright/test';
import { installTripOperationsMock } from './fixtures/admin-trip-operations';
import { expectNoWcagAaViolations } from './fixtures/accessibility';

test('overview retains seven summary destinations with independent errors', async ({ page }) => {
  const controls = await installTripOperationsMock(page);
  controls.summaryError = true;
  await page.goto('/admin');
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  await expect(page.getByTestId('transportation-summary-error')).toBeVisible();
  controls.summaryError = false;
  await page.getByRole('button', { name: 'Retry summary' }).click();
  await expect(page.getByTestId('transportation-summary').getByRole('link')).toHaveCount(7);
  controls.tripError = true;
  await page.getByRole('button', { name: 'Refresh trips' }).click();
  await expect(page.getByTestId('trip-search-error')).toBeVisible();
  await expect(page.getByTestId('transportation-summary').getByRole('link')).toHaveCount(7);
});

test('polling/focus refresh and failed background reads retain clearly unverified results', async ({
  page,
}) => {
  const controls = await installTripOperationsMock(page);
  await page.goto('/admin');
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  controls.rows[0] = {
    ...controls.rows[0],
    location_status: 'live',
    latest_location_at: '2026-10-28T14:01:00Z',
    eta_label: null,
  };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr').first()).toContainText(
    'Live',
  );
  controls.tripError = true;
  await page.clock.runFor(15_100);
  await expect(page.getByRole('alert')).toContainText('last checked list');
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr').first()).toContainText(
    'Unverified GPS',
  );
  controls.tripError = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Today rolls at Alberta midnight while all-date default keeps overnight trips', async ({
  page,
}) => {
  // Start near midnight before creating the one-hour synthetic auth session.
  const controls = await installTripOperationsMock(page, '2026-10-29T05:59:50Z');
  await page.goto('/admin');
  await expect(page.getByTestId('admin-trips-table')).toContainText('Route 1');
  await page.getByLabel('Dates', { exact: true }).selectOption('today');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => controls.requests.at(-1)?.p_from_date).toBe('2026-10-28');
  await page.clock.setSystemTime(new Date('2026-10-29T06:00:01Z'));
  await page.clock.runFor(15_100);
  await expect.poll(() => controls.requests.at(-1)?.p_from_date).toBe('2026-10-29');
});

test('View and back links preserve dates, status and page', async ({ page }) => {
  await installTripOperationsMock(page);
  await page.goto('/admin?tripMode=all&tripPage=2&tripSize=25&tripStatus=completed');
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 26-50');
  const view = page.getByRole('link', { name: /View trip/ }).first();
  await view.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('admin-trip-detail')).toBeVisible();
  await page.getByRole('link', { name: 'Back to trips' }).click();
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 26-50');
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('admin layouts use available width, contain tables and support both themes', async ({
  page,
}, testInfo) => {
  await installTripOperationsMock(page);
  await page.goto('/admin');
  for (const width of [390, 768, 1440, 2400]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await expect(page.getByTestId('admin-trips-table')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (width === 2400)
        expect(
          await page.locator('main').evaluate((el) => el.getBoundingClientRect().width),
        ).toBeGreaterThan(1800);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('overview-wide-dark.png'), fullPage: true });
  await expectNoWcagAaViolations(page, 'Consolidated overview');
});

test('support website link and editor are removed while other contact methods remain', async ({
  page,
}) => {
  await installTripOperationsMock(page);
  await page.goto('/support');
  await expect(page.getByRole('link', { name: 'platform@example.test' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open support website' })).toHaveCount(0);
  await page.goto('/admin/settings/support');
  await expect(page.getByRole('textbox', { name: 'Support email', exact: true })).toBeVisible();
  await expect(page.getByLabel('Support website')).toHaveCount(0);
});
