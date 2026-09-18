import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';

// Browser behavior tests with synthetic responses; these do not prove database RLS.
test('a hung map refresh removes the old location and can recover', async ({ page }) => {
  const fixture = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.clock.install();
  await page.goto('/guardian/live-map');
  await expect(page.getByText('Current location available', { exact: true })).toBeVisible();

  let requested = false;
  await page.route('**/rest/v1/rpc/get_guardian_bus_visibility_v2', () => {
    requested = true;
  });
  await page.getByTestId('guardian-live-map-refresh-button').click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.fastForward(10_001);
  await expect(page.getByTestId('guardian-live-map-error')).toBeVisible();
  await expect(page.getByText('Current location available', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(0);
  await expect(page.getByTestId('guardian-live-map-refresh-button')).toBeEnabled();

  fixture.setRows([]);
  await page.unroute('**/rest/v1/rpc/get_guardian_bus_visibility_v2');
  await page.getByTestId('guardian-live-map-refresh-button').click();
  await expect(page.getByTestId('guardian-live-map-empty')).toBeVisible();
});

test('guardian bus assignments revalidate without a manual refresh', async ({ page }) => {
  const fixture = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.clock.install();
  await page.goto('/guardian/routes');
  await expect(page.getByText('Avery Johnson', { exact: true })).toBeVisible();
  fixture.setRows([]);
  await page.clock.fastForward(15_001);
  await expect(page.getByText('Avery Johnson', { exact: true })).toHaveCount(0);
});
