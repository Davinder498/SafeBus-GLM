import { expect, test, type Page } from '@playwright/test';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock, MOCK } from '../smoke/fixtures/supabase-mock';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

// Exercise the camera path without a manual QA token field or app test hook.
// The browser receives a synthetic video stream; only barcode detection is mocked.
async function installBusCamera(page: Page) {
  await page.addInitScript((token) => {
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class {
        async detect() {
          return [{ rawValue: token }];
        }
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        canvas.getContext('2d')?.fillRect(0, 0, 320, 240);
        const stream = canvas.captureStream(15);
        // Keep the canvas alive while the scanner consumes its stream.
        Object.defineProperty(stream, 'testCanvas', { value: canvas });
        return stream;
      },
    });
  }, MOCK.busQrToken);
}

test.describe('Commercial mobile journeys and degraded behavior', () => {
  test('unhandled external HTTP and realtime connections cannot leave the local gate', async ({
    page,
  }) => {
    await page.goto('/login');
    const result = await page.evaluate(async () => {
      const httpBlocked = await fetch('https://placeholder.supabase.co/unhandled-test-probe').then(
        () => false,
        () => true,
      );
      const socketClosed = await new Promise<boolean>((resolve) => {
        const socket = new WebSocket('wss://placeholder.supabase.co/unhandled-test-probe');
        socket.onclose = (event) =>
          resolve(event.code === 1000 && event.reason === 'Local browser test boundary');
      });
      return { httpBlocked, socketClosed };
    });
    expect(result).toEqual({ httpBlocked: true, socketClosed: true });
  });

  test('driver can start and end the assigned bus trip from the QR workflow', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719 });
    await installSupabaseMock(page);
    await installBusCamera(page);
    const writes: Array<{ rpc: string; body: unknown }> = [];
    page.on('request', (request) => {
      const rpc = new URL(request.url()).pathname.split('/').at(-1) ?? '';
      if (['start_bus_tracking_from_qr', 'confirm_pre_trip', 'end_driver_trip'].includes(rpc))
        writes.push({ rpc, body: request.postDataJSON() });
    });

    await page.goto('/driver');
    await expect(page.getByLabel('School', { exact: true })).toHaveCount(0);
    await page.getByTestId('driver-scan-bus-qr').click();
    await page.getByRole('button', { name: /North Ridge Outbound/ }).click();
    await expect(page.getByTestId('driver-confirm-inspection-start')).toBeDisabled();
    expect(writes).toEqual([]);
    await page.getByLabel(/I confirm the pre-trip inspection/).check();
    await page.getByTestId('driver-confirm-inspection-start').click();
    await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Bus 12 started. This phone is now its GPS.', { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([
      {
        rpc: 'start_bus_tracking_from_qr',
        body: {
          p_qr_token: MOCK.busQrToken,
          p_bus_route_assignment_id: MOCK.assignmentId,
        },
      },
      { rpc: 'confirm_pre_trip', body: { p_trip_id: MOCK.tripId } },
    ]);

    await page
      .getByTestId('driver-active-trip-only')
      .getByRole('button', { name: 'End trip' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(writes.filter((write) => write.rpc === 'end_driver_trip')).toHaveLength(0);
    await page.getByRole('dialog').getByRole('button', { name: 'End trip' }).click();
    await expect(
      page.getByText('Trip ended. Location sharing stopped.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-only')).toHaveCount(0);
    await expect(page.getByTestId('driver-scan-bus-qr')).toBeVisible();
    expect(writes.at(-1)).toEqual({
      rpc: 'end_driver_trip',
      body: { p_trip_id: MOCK.tripId },
    });
    expect(writes.filter((write) => write.rpc === 'end_driver_trip')).toHaveLength(1);
  });

  test('guardian sees only the linked-student bus status contract', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/parent');
    const student = page.getByTestId('guardian-home-student-card');
    await expect(student).toHaveCount(1);
    await expect(student).toContainText('Avery Johnson');
    await expect(student).toContainText('Bus 42');
    await expect(page.getByText('51.0447')).toHaveCount(0);
    await page.getByRole('link', { name: 'View details for Bus 42' }).click();
    await expect(page.getByRole('heading', { name: 'Bus 42', level: 1 })).toBeVisible();
    await expect(page.getByText('Avery Johnson', { exact: true })).toBeVisible();

    // The synthetic API grants only Bus 42. An arbitrary bus URL must not show it.
    await page.goto('/guardian/buses/99');
    await expect(page.getByText('This bus is not available.', { exact: true })).toBeVisible();
    await expect(page.getByText('Avery Johnson', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-ui="guardian-bus-detail-hero"]')).toHaveCount(0);
  });

  for (const role of ['guardian', 'driver'] as const) {
    test(`role guards keep a ${role} account out of the other mobile portal`, async ({ page }) => {
      let operationalCalls = 0;
      page.on('request', (request) => {
        if (
          /\/rest\/v1\/(driver_trips|rpc\/(get_guardian_bus_visibility_v2|get_driver_active_trip))/.test(
            request.url(),
          )
        )
          operationalCalls += 1;
      });
      if (role === 'guardian') await installGuardianVisibilityMock(page);
      else await installSupabaseMock(page);
      await page.goto(role === 'guardian' ? '/driver' : '/parent');
      await expect(page.getByRole('heading', { name: 'Wrong portal', level: 1 })).toBeVisible();
      await expect(page.getByTestId('guardian-home-student-card')).toHaveCount(0);
      await expect(page.getByTestId('driver-scan-bus-qr')).toHaveCount(0);
      expect(operationalCalls).toBe(0);
    });
  }

  test('mobile app rejects an administrator and clears the local session', async ({ page }) => {
    const fixture = await installGuardianVisibilityMock(page, { role: 'tenant_admin' });
    await page.goto('/parent');
    await expect(
      page.getByRole('heading', { name: 'Use the correct BusSafe app', level: 1 }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sb-placeholder-auth-token')))
      .toBeNull();
    expect(fixture.getCallCount()).toBe(0);
  });

  test('guardian data failure hides backend details and linked-student data, then recovers', async ({
    page,
  }) => {
    const rawBackendError = 'row-level security policy leaked private guardian identifier';
    const fixture = await installGuardianVisibilityMock(page, {
      rows: [guardianVisibilityRow()],
      fail: true,
      rawError: rawBackendError,
    });
    await page.goto('/parent');
    await expect(page.getByText('We could not load your buses.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('guardian-home-student-card')).toHaveCount(0);
    await expect(page.getByTestId('guardian-home-bus-card')).toHaveCount(0);
    await expect(page.getByText(rawBackendError)).toHaveCount(0);
    fixture.setFail(false);
    await page.reload();
    await expect(page.getByTestId('guardian-home-student-card')).toContainText('Avery Johnson');
  });

  test('session registration failure blocks driver operations without exposing backend details', async ({
    page,
  }) => {
    const rawBackendError = 'internal auth.sessions failure; request-id=private-session-123';
    await installSupabaseMock(page);
    await page.route('**/rest/v1/rpc/register_current_user_session', (route) =>
      route.fulfill({
        status: 503,
        json: { message: rawBackendError },
      }),
    );
    await page.goto('/driver');
    await expect(
      page.getByRole('heading', { name: 'Profile setup needed', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('We could not verify this BusSafe session. Sign in again or retry shortly.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('driver-scan-bus-qr')).toHaveCount(0);
    await expect(page.getByTestId('driver-active-trip-only')).toHaveCount(0);
    await expect(page.getByText(rawBackendError)).toHaveCount(0);
  });
});

test.describe('Commercial mobile WCAG 2.2 AA gate', () => {
  test.describe.configure({ timeout: 60_000 });

  test('driver bus-scan surface', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');
    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
    ).toBeVisible();
    await expectNoWcagAaViolations(page, 'Mobile driver bus scan');
  });

  test('driver active-trip surface', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');
    await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Mobile driver active trip');
  });

  test('guardian home and bus detail surfaces', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/parent');
    await expect(page.getByTestId('guardian-home-student-card')).toBeVisible();
    await expectNoWcagAaViolations(page, 'Mobile guardian home');
    await page.getByRole('link', { name: 'View details for Bus 42' }).click();
    await expect(page.locator('[data-ui="guardian-service-line"]')).toBeVisible();
    await expectNoWcagAaViolations(page, 'Mobile guardian bus detail');
  });
});
