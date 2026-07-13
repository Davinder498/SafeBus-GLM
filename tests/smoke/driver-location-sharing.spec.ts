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
 *   - Test 1: no active trip -> no location controls or location panel.
 *   - Test 2: active trip -> geolocation starts automatically and publishes.
 *   - Test 3: geolocation permission denied -> friendly error shown, no crash.
 */

test.describe('Driver location sharing', () => {
  test('no active trip: location sharing UI is not shown', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    await expect(page.getByTestId('driver-location-panel')).toHaveCount(0);
    await expect(page.getByTestId('driver-location-start-button')).toHaveCount(0);
    await expect(page.getByTestId('driver-location-stop-button')).toHaveCount(0);
  });

  test('active trip starts location sharing automatically without location controls', async ({ browser }) => {
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

    // The active trip automatically starts the location watcher.
    await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active', { timeout: 10000 });
    await expect(page.getByTestId('driver-location-start-button')).toHaveCount(0);
    await expect(page.getByTestId('driver-location-stop-button')).toHaveCount(0);

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

  test('Start Trip automatically begins location sharing', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.0447, longitude: -114.0719 },
    });
    const page = await context.newPage();
    await installSupabaseMock(page, { withAssignments: true });

    let locationUpdates = 0;
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/update_driver_trip_location')) {
        locationUpdates += 1;
      }
    });

    await page.goto('/driver');
    await expect(page.getByTestId('driver-location-panel')).toHaveCount(0);
    await page.getByTestId('driver-assignment-start-button').click();

    await expect(page.getByText('Trip started. Have a safe drive.')).toBeVisible();
    await expect(page.getByTestId('driver-location-status')).toContainText(
      'Location sharing active',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('driver-location-start-button')).toHaveCount(0);
    await expect(page.getByTestId('driver-location-stop-button')).toHaveCount(0);
    expect(locationUpdates).toBeGreaterThan(0);

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

    // Automatic sharing reports a friendly permission-denied error.
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
    await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active');

    await context.setOffline(true);
    await expect(page.getByTestId('driver-location-status')).toContainText('Offline');
    await context.setOffline(false);

    expect(maxInFlight).toBe(1);
    await context.close();
  });
});
