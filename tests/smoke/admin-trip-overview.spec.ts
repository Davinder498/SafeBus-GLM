import { expect, test } from '@playwright/test';
import { installTripOperationsMock } from './fixtures/admin-trip-operations';

for (const path of ['/admin', '/admin/live-trips', '/admin/trips'])
  test(`${path} uses one paginated all-date list with ongoing trips first`, async ({ page }) => {
    const controls = await installTripOperationsMock(page);
    await page.goto(path);
    const table = page.getByTestId('admin-trips-table');
    await expect(table.locator('tbody tr')).toHaveCount(25);
    await expect(table.locator('tbody tr').first()).toContainText('Route 1');
    await expect(page.getByTestId('admin-live-fleet-map')).toHaveCount(0);
    await expect(page.getByTestId('admin-ongoing-trips')).toHaveCount(0);
    expect(controls.requests[0]).toMatchObject({
      p_from_date: null,
      p_to_date: null,
      p_page: 1,
      p_page_size: 25,
    });
    await expect(table.getByRole('link', { name: /View trip/ })).toHaveCount(25);
    await expect(table).toContainText('Missing GPS');
    for (const label of ['Active', 'Paused', 'Completed', 'Cancelled']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(table.locator('tbody tr').first()).toContainText(label);
      expect(controls.requests.at(-1)?.p_status).toBe(label.toLowerCase());
    }
  });

test('filters/counts/page sizes are server queries and old history remains reachable', async ({
  page,
}) => {
  const controls = await installTripOperationsMock(page);
  await page.goto('/admin/trips');
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-25 of 228');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 26-50');
  await page.getByLabel('Rows', { exact: true }).selectOption('100');
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-100');
  await page.getByLabel('Dates', { exact: true }).selectOption('range');
  await page.getByLabel('From date', { exact: true }).fill('2025-01-01');
  await page.getByLabel('To date', { exact: true }).fill('2025-01-31');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('admin-trips-table')).toContainText('Route 230');
  expect(controls.requests.at(-1)).toMatchObject({
    p_from_date: '2025-01-01',
    p_to_date: '2025-01-31',
    p_page: 1,
    p_page_size: 100,
  });
  await page.getByLabel('From date', { exact: true }).fill('2025-02-01');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('end date');
});

test('empty, missing release, and access-failure states do not fabricate trips', async ({
  page,
}) => {
  const controls = await installTripOperationsMock(page);
  controls.rows = [];
  await page.goto('/admin/trips');
  await expect(page.getByTestId('admin-trips-empty')).toBeVisible();
  controls.missingRpc = true;
  await page.getByRole('button', { name: 'Refresh trips' }).click();
  await expect(page.getByTestId('trip-search-error')).toContainText(
    'platform database update is pending',
  );
  controls.missingRpc = false;
  controls.accessError = true;
  await page.getByRole('button', { name: 'Retry trips' }).click();
  await expect(page.getByTestId('trip-search-error')).toContainText('administrator permissions');
});

test('shrinking pages recover to the last valid page', async ({ page }) => {
  const controls = await installTripOperationsMock(page);
  controls.rows = controls.rows.slice(0, 26);
  await page.goto('/admin/trips');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 26-26');
  controls.rows = controls.rows.slice(0, 2);
  await page.clock.runFor(15_100);
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-2');
});
