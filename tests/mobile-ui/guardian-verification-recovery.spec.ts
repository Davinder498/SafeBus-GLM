import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';

test('a bus detail refresh failure clears previously verified student and route data', async ({
  page,
}) => {
  const fixture = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.clock.install();
  await page.goto('/guardian/buses/42');
  await expect(page.locator('[data-ui="guardian-bus-detail-hero"]')).toBeVisible();
  await expect(page.getByText('Avery Johnson', { exact: true })).toBeVisible();
  fixture.setFail(true);
  await page.clock.fastForward(15_001);
  await expect(page.getByText('We could not load this bus.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="guardian-bus-detail-hero"]')).toHaveCount(0);
  await expect(page.getByText('Avery Johnson', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Cedar School Line', { exact: true })).toHaveCount(0);

  fixture.setFail(false);
  fixture.setRows([]);
  await page.clock.fastForward(15_001);
  await expect(page.getByText('This bus is not available.', { exact: true })).toBeVisible();
});
