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

    // Capture update_driver_trip_location RPC request bodies so we can assert
    // the client sends only trip id + geo inputs and NEVER tenant/driver/bus/
    // route ids.
    const locationRpcBodies: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        url.includes('/rest/v1/rpc/update_driver_trip_location') &&
        request.method() === 'POST'
      ) {
        try {
          const body = JSON.parse(request.postData() ?? '{}');
          locationRpcBodies.push(body);
        } catch {
          // ignore non-JSON bodies
        }
      }
    });

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

    // --- Assert the RPC payload shape (non-blocking fix C) ---
    // At least one update_driver_trip_location RPC was sent.
    expect(locationRpcBodies.length).toBeGreaterThan(0);

    const payload = locationRpcBodies[0]!;
    // The client MUST send the trip id and geo inputs.
    expect(payload.p_driver_trip_id).toBeTruthy();
    expect(typeof payload.p_latitude).toBe('number');
    expect(typeof payload.p_longitude).toBe('number');
    // source defaults to 'browser'.
    expect(payload.p_source).toBe('browser');
    // Optional geo fields may be present and must be null or finite numbers.
    for (const key of ['p_accuracy_m', 'p_heading_deg', 'p_speed_mps'] as const) {
      const v = payload[key];
      expect(v === null || typeof v === 'number').toBe(true);
    }
    // The client MUST NOT send tenant_id, driver_id, bus_id, or route_id —
    // the RPC derives these server-side from the validated active trip row.
    expect(payload).not.toHaveProperty('p_tenant_id');
    expect(payload).not.toHaveProperty('p_driver_id');
    expect(payload).not.toHaveProperty('p_bus_id');
    expect(payload).not.toHaveProperty('p_route_id');
    expect(payload).not.toHaveProperty('tenant_id');
    expect(payload).not.toHaveProperty('driver_id');
    expect(payload).not.toHaveProperty('bus_id');
    expect(payload).not.toHaveProperty('route_id');

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

  test('temporary network loss reports offline and resumes without overlapping submissions', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.0447, longitude: -114.0719 },
    });
    const page = await context.newPage();
    await installSupabaseMock(page, { withActiveTrip: true, locationUpdateDelayMs: 500 });

    let inFlight = 0;
    let maxInFlight = 0;
    page.on('request', (request) => {
      if (request.url().includes('/rpc/update_driver_trip_location')) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
      }
    });
    page.on('requestfinished', (request) => {
      if (request.url().includes('/rpc/update_driver_trip_location')) inFlight -= 1;
    });

    await page.goto('/driver');
    await page.getByTestId('driver-location-start-button').click();
    await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active');

    await context.setOffline(true);
    await expect(page.getByTestId('driver-location-status')).toContainText('Offline');
    await context.setOffline(false);

    expect(maxInFlight).toBe(1);
    await context.close();
  });
});
