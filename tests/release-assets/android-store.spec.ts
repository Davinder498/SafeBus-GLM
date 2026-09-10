import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';

const screenshotDirectory = path.resolve('apps', 'mobile', 'assets', 'google-play', 'screenshots');

async function capture(page: Page, filename: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(350);
  const [scrollWidth, clientWidth] = await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
    return [document.documentElement.scrollWidth, document.documentElement.clientWidth];
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await page.screenshot({
    path: path.join(screenshotDirectory, filename),
    animations: 'disabled',
    caret: 'hide',
  });
}

test('capture synthetic guardian live status', async ({ page }) => {
  await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
  });

  await page.goto('/guardian/live');
  await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toBeVisible();
  await capture(page, '01-guardian-live-status.png');
});

test('capture synthetic guardian trip updates', async ({ page }) => {
  await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
  });
  await page.goto('/guardian/events');
  await expect(
    page.getByRole('heading', { name: 'Pickup & Drop-off Status', level: 1 }),
  ).toBeVisible();
  await capture(page, '02-guardian-trip-updates.png');
});

test('capture synthetic driver active trip', async ({ page }) => {
  await installSupabaseMock(page, { withActiveTrip: true, withCompletedTrips: true });

  await page.goto('/driver');
  await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
  await capture(page, '03-driver-active-trip.png');
});

test('capture synthetic driver trip history', async ({ page }) => {
  await installSupabaseMock(page, { withActiveTrip: true, withCompletedTrips: true });
  await page.goto('/driver/history');
  await expect(page.getByRole('heading', { name: 'Completed trips', level: 1 })).toBeVisible();
  await capture(page, '04-driver-trip-history.png');
});
