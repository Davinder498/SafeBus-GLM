import { expect, test } from '@playwright/test';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

test.describe('Driver dashboard — authenticated', () => {
  test('shows one bus-scan action instead of route assignments', async ({ page }) => {
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('driver-bus-qr-scanner')).toBeVisible();
    await expect(page.getByTestId('driver-scan-bus-qr')).toHaveText('Scan bus QR to start');
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);
    await expect(page.getByTestId('driver-outbound-toggle')).toHaveCount(0);
    await expect(page.getByTestId('driver-return-toggle')).toHaveCount(0);
  });

  test('claims the prepared bus from its QR and binds this phone to the active bus', async ({
    page,
  }) => {
    let scannedToken: string | undefined;
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719 });
    await installSupabaseMock(page);
    await page.route('**/rpc/start_bus_tracking_from_qr', async (route) => {
      scannedToken = (route.request().postDataJSON() as { p_qr_token?: string }).p_qr_token;
      await route.fallback();
    });
    await page.goto('/driver');

    await page.getByTestId('driver-scan-bus-qr').click();
    await page.getByLabel('Manual bus QR token for QA').fill(MOCK.busQrToken);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-only')).toBeVisible();
    await expect(page.getByText('This phone is now its GPS.')).toBeVisible();
    expect(scannedToken).toBe(MOCK.busQrToken);
  });

  test('does not claim a bus when the phone cannot provide location', async ({ page }) => {
    let startRequests = 0;
    await installSupabaseMock(page);
    await page.route('**/rpc/start_bus_tracking_from_qr', async (route) => {
      startRequests += 1;
      await route.fallback();
    });
    await page.goto('/driver');

    await page.getByTestId('driver-scan-bus-qr').click();
    await page.getByLabel('Manual bus QR token for QA').fill(MOCK.busQrToken);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(
      page.getByText('Location permission is required. The bus was not started.'),
    ).toBeVisible();
    expect(startRequests).toBe(0);
    await expect(page.getByTestId('driver-active-trip-only')).toHaveCount(0);
  });

  test('requires confirmation to end the trip and returns to bus scanning', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');

    const activeTrip = page.getByTestId('driver-active-trip-only');
    await expect(activeTrip).toBeVisible();
    await activeTrip.getByRole('button', { name: 'End trip' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'End this bus trip?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'End trip' }).click();

    await expect(page.getByText('Trip ended. Location sharing stopped.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
    ).toBeVisible();
  });

  test('fits the scan workflow on a driver phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installSupabaseMock(page);
    await page.goto('/driver');

    const scanButton = page.getByTestId('driver-scan-bus-qr');
    await expect(scanButton).toBeVisible();
    expect((await scanButton.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
