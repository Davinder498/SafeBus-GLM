import { expect, test } from '@playwright/test';
import { installTripOperationsMock, tripId } from './fixtures/admin-trip-operations';
import { expectNoWcagAaViolations } from './fixtures/accessibility';
import { installMapProviderOutage } from './fixtures/map-provider';

test('trip detail shows one trip, all stops, roster and recorded evidence', async ({
  page,
}, testInfo) => {
  const controls = await installTripOperationsMock(page);
  await page.goto(`/admin/trips/${tripId(1)}`);
  await expect(page.getByRole('heading', { name: 'Route 1', exact: true })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Stops in travel order' }).getByRole('listitem'),
  ).toHaveCount(2);
  const students = page.getByRole('region', { name: 'Trip students' });
  await expect(students).toContainText('Assigned Student');
  await expect(students).toContainText('Recorded Student');
  await expect(students).toContainText('Recorded events only');
  await expect(students).toContainText('Picked up');
  await expect(page.getByTestId('admin-trip-map').locator('.leaflet-interactive')).toHaveCount(4);
  await expect(page.getByText('Bus toward School', { exact: true })).toBeVisible();
  expect(controls.detailRequests.every((id) => id === tripId(1))).toBe(true);
  await page.getByLabel('Operational status', { exact: true }).selectOption('late');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect.poll(() => controls.dispatchWrites).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('trip-detail.png'), fullPage: true });
  await expectNoWcagAaViolations(page, 'Admin trip detail');
});

test('completed trips show route map without a current bus marker or dispatch editor', async ({
  page,
}) => {
  const controls = await installTripOperationsMock(page);
  controls.detailStatus = 'completed';
  await page.goto(`/admin/trips/${tripId(1)}`);
  await expect(page.getByTestId('admin-trip-map').locator('.leaflet-interactive')).toHaveCount(3);
  await expect(page.getByLabel('Operational status', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Bus toward School', { exact: true })).toHaveCount(0);
});

test('offline or failed refresh removes unverified bus progress; revoked access clears student data', async ({
  page,
}) => {
  const controls = await installTripOperationsMock(page);
  await page.goto(`/admin/trips/${tripId(1)}`);
  await expect(page.getByText('Bus toward School', { exact: true })).toBeVisible();
  controls.tripError = true;
  await page.clock.runFor(15_100);
  await expect(page.getByRole('alert')).toContainText('Unable to load');
  await expect(page.getByText('Bus toward School', { exact: true })).toHaveCount(0);
  controls.tripError = false;
  controls.accessError = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Trip students' })).toHaveCount(0);
});

test('provider failure retains stop list and trip details', async ({ page }) => {
  const controls = await installTripOperationsMock(page);
  controls.tileError = true;
  await installMapProviderOutage(page);
  await page.goto(`/admin/trips/${tripId(1)}`);
  await expect(page.getByTestId('admin-trip-map')).toContainText('Map unavailable');
  await expect(
    page.getByRole('list', { name: 'Stops in travel order' }).getByRole('listitem'),
  ).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Trip students' })).toBeVisible();
});

test('missing and malformed trip URLs have a recoverable unavailable state', async ({ page }) => {
  const controls = await installTripOperationsMock(page);
  controls.detailMissing = true;
  await page.goto(`/admin/trips/${tripId(999)}`);
  await expect(page.getByText('Trip unavailable', { exact: true })).toBeVisible();
  await page.goto('/admin/trips/bad');
  await expect(page.getByText('Trip unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to trips' })).toHaveAttribute(
    'href',
    '/admin/trips',
  );
});
