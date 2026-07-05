import { test, expect } from '@playwright/test';
import { installSupabaseMock } from './fixtures/supabase-mock';

/**
 * Milestone 4B — driver location sharing smoke tests.
 *
 * Uses the mocked Supabase layer (no production credentials, no backdoors).
 * Browser geolocation is mocked via Playwright's context.setGeolocation and
 * permissions APIs. No real GPS is required.
 *
 * Coverage:
 *   - Test 1: no active trip -> location panel visible, start disabled, helper
 *     text "Start a trip before sharing location."
 *   - Test 2: active trip -> start button enabled -> click -> geolocation mock
 *     fires -> active status + stop button appear.
 *   - Test 3: geolocation permission denied -> friendly error shown, no crash.
 */

test.describe('Driver location sharing', () => {
  test('no active trip: location panel shows unavailable state with disabled start', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    // Panel is visible.
    const panel = page.getByTestId('driver-location-panel');
    await expect(panel).toBeVisible();

    // Helper text indicates a trip is required.
    await expect(
      page.getByTestId('driver-location-status'),
    ).toContainText('Start a trip before sharing location.');

    // Start button is present but disabled.
    const startButton = page.getByTestId('driver-location-start-button');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
  });

  test('active trip enables location sharing; start -> active status + stop button', async ({ browser }) => {
    // Grant geolocation permission and set a deterministic location before the
    // page loads, so watchPosition fires immediately when sharing starts.
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.0447, longitude: -114.0719 },
    });
    const page = await context.newPage();

    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');

    // Active trip is present, so the start button should be enabled.
    const startButton = page.getByTestId('driver-location-start-button');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // Start sharing.
    await startButton.click();

    // Active status appears and stop button appears. The status text includes
    // "active" once the first mocked fix is processed.
    await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active', { timeout: 10000 });
    await expect(page.getByTestId('driver-location-stop-button')).toBeVisible();

    // Stop sharing.
    await page.getByTestId('driver-location-stop-button').click();

    // After stopping, the start button returns.
    await expect(page.getByTestId('driver-location-start-button')).toBeVisible();

    await context.close();
  });

  test('geolocation permission denied: friendly error shown, no crash', async ({ browser }) => {
    // Deny geolocation at the context level. Playwright does not have a direct
    // "deny geolocation" permission, so we override navigator.geolocation in the
    // page to simulate a PERMISSION_DENIED error when watchPosition is called.
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.addInitScript(() => {
      // Replace watchPosition so it immediately invokes its error callback with
      // PERMISSION_DENIED. This deterministically simulates a denied permission
      // without depending on browser permission dialogs.
      const fakeGeolocation = {
        watchPosition: (_success: unknown, error: (e: { code: number; message: string }) => void) => {
          error({ code: 1, message: 'User denied Geolocation' });
          return 1;
        },
        clearWatch: () => {},
        getCurrentPosition: (_success: unknown, error: (e: { code: number; message: string }) => void) => {
          error({ code: 1, message: 'User denied Geolocation' });
        },
      };
      Object.defineProperty(navigator, 'geolocation', {
        value: fakeGeolocation,
        configurable: true,
      });
    });

    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');

    const startButton = page.getByTestId('driver-location-start-button');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Friendly permission-denied error is shown.
    await expect(page.getByTestId('driver-location-error')).toContainText(
      'Location permission was denied',
    );

    // The page did not crash: the panel and heading are still visible.
    await expect(page.getByTestId('driver-location-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Location sharing' })).toBeVisible();

    await context.close();
  });
});
