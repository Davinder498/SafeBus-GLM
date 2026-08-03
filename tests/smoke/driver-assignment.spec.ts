import { expect, test } from '@playwright/test';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

test.describe('bus-first driver workflow', () => {
  test('driver does not need a route assignment chooser', async ({ page }) => {
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('driver-scan-bus-qr')).toBeVisible();
    await expect(page.getByLabel('Bus')).toHaveCount(0);
    await expect(page.getByLabel('Route')).toHaveCount(0);
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);
  });

  test('raw backend QR start errors are safely handled', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719 });
    await installSupabaseMock(page);
    const rawError = 'permission denied for bus_qr_credentials';
    await page.route('**/rpc/start_bus_tracking_from_qr', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: rawError }),
      });
    });
    await page.goto('/driver');

    await page.getByTestId('driver-scan-bus-qr').click();
    await page.getByLabel('Manual bus QR token for QA').fill(MOCK.busQrToken);
    await page.getByRole('button', { name: 'Connect' }).click();
    await page.getByRole('button', { name: /North Ridge Outbound/ }).click();

    await expect(page.getByText('This bus QR could not be verified or started.')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(rawError)).toHaveCount(0);
  });
});
