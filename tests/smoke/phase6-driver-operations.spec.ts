import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';
import { FAKE_ACCESS_TOKEN } from './fixtures/phase6-jwt';

/**
 * Phase 6 — Driver transportation operations completion smoke tests.
 *
 * Verifies the new non-ETA driver operational workflow:
 *   - Pre-trip confirmation button appears and records confirmation
 *   - Pause trip -> status shows paused + Resume button appears
 *   - Resume trip -> status returns to active
 *   - Record exception form submits successfully
 *   - Cancel trip -> confirmation dialog -> trip cleared
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock pattern follows the
 * proven transportation-domain-model.spec.ts setup, extended with the Phase 6
 * RPCs (pause/resume/cancel/confirm_pre_trip/record_trip_exception).
 */

const DRIVER = {
  profileId: 'aaaaaaaa-1111-aaaa-1111-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-2222-bbbb-2222-bbbbbbbbbbbb',
  driverId: 'cccccccc-3333-cccc-3333-cccccccccccc',
  busId: 'dddddddd-4444-dddd-4444-dddddddddddd',
  routeId: 'eeeeeeee-5555-eeee-5555-eeeeeeeeeeee',
  tripId: 'ffffffff-6666-ffff-6666-ffffffffffff',
  tripPatternId: '11111111-7777-1111-7777-111111111111',
} as const;

const driverProfile = {
  id: DRIVER.profileId,
  tenant_id: DRIVER.tenantId,
  school_id: null,
  full_name: 'Phase Six Driver',
  email: 'driver@phase6-smoke.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const busRow = {
  id: DRIVER.busId,
  tenant_id: DRIVER.tenantId,
  school_id: null,
  bus_number: 'P6',
  license_plate: 'SB-P6',
  capacity: 48,
  status: 'active',
};

const routeRow = {
  id: DRIVER.routeId,
  tenant_id: DRIVER.tenantId,
  school_id: null,
  route_name: 'Phase Six AM',
  route_code: 'P6-AM',
  route_type: 'morning',
  status: 'active',
};

function activeTripRow(status = 'active') {
  return {
    id: DRIVER.tripId,
    tenant_id: DRIVER.tenantId,
    driver_id: DRIVER.driverId,
    bus_id: DRIVER.busId,
    bus_number_snapshot: busRow.bus_number,
    route_id: DRIVER.routeId,
    route_trip_pattern_id: DRIVER.tripPatternId,
    driver_route_assignment_id: null,
    trip_name_snapshot: 'Phase Six Outbound',
    trip_type: 'morning',
    status,
    service_date: '2025-01-01',
    started_at: '2025-01-01T12:00:00.000Z',
    ended_at: null,
    created_at: '2025-01-01T12:00:00.000Z',
    updated_at: '2025-01-01T12:00:00.000Z',
  };
}

async function installPhase6DriverMock(page: Page) {
  // The active trip state is mutable so RPCs can transition it.
  let currentTrip: Record<string, unknown> | null = activeTripRow('active');

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }
    const method = route.request().method();
    const path = url.pathname;

    // --- Auth ---
    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: driverProfile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: driverProfile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: driverProfile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: FAKE_ACCESS_TOKEN,
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: driverProfile.id,
              email: driverProfile.email,
              aud: 'authenticated',
              role: 'authenticated',
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // --- PostgREST ---
    if (path.startsWith('/rest/v1/')) {
      const accept = route.request().headers()['accept'] ?? '';
      const wantsSingle = accept.includes('application/vnd.pgrst.object+json');

      const fulfillRows = async (rows: Record<string, unknown>[]) => {
        if (wantsSingle) {
          if (rows.length === 0) {
            await route.fulfill({
              status: 406,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'no rows' }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(rows[0]),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rows),
        });
      };

      if (method === 'GET') {
        if (path.includes('/profiles')) {
          await fulfillRows([driverProfile]);
          return;
        }
        if (path.includes('/buses')) {
          await fulfillRows([busRow]);
          return;
        }
        if (path.includes('/routes')) {
          await fulfillRows([routeRow]);
          return;
        }
        if (path.includes('/driver_trips')) {
          await fulfillRows(currentTrip ? [currentTrip] : []);
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      if (method === 'POST') {
        // Phase 6 RPCs ------------------------------------------------
        if (path.includes('/rpc/pause_driver_trip')) {
          currentTrip = { ...currentTrip, status: 'paused' } as typeof currentTrip;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(currentTrip),
          });
          return;
        }
        if (path.includes('/rpc/resume_driver_trip')) {
          currentTrip = { ...currentTrip, status: 'active' } as typeof currentTrip;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(currentTrip),
          });
          return;
        }
        if (path.includes('/rpc/cancel_driver_trip')) {
          currentTrip = {
            ...currentTrip,
            status: 'cancelled',
            ended_at: '2025-01-01T12:30:00.000Z',
          } as typeof currentTrip;
          // Return the cancelled object, then clear local state so the next GET returns empty.
          const cancelled = currentTrip;
          currentTrip = null;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(cancelled),
          });
          return;
        }
        if (path.includes('/rpc/end_driver_trip')) {
          currentTrip = null;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...activeTripRow('completed'),
              ended_at: '2025-01-01T12:45:00.000Z',
            }),
          });
          return;
        }
        if (path.includes('/rpc/confirm_pre_trip')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'pre-trip-confirmation-id',
              tenant_id: DRIVER.tenantId,
              driver_trip_id: DRIVER.tripId,
              driver_id: DRIVER.driverId,
              bus_id: DRIVER.busId,
              confirmed_at: '2025-01-01T12:01:00.000Z',
              created_at: '2025-01-01T12:01:00.000Z',
            }),
          });
          return;
        }
        if (path.includes('/rpc/record_trip_exception')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'exception-id',
              tenant_id: DRIVER.tenantId,
              driver_trip_id: DRIVER.tripId,
              driver_id: DRIVER.driverId,
              exception_type: 'traffic_delay',
              exception_detail: 'railway crossing',
              occurred_at: '2025-01-01T12:05:00.000Z',
              created_at: '2025-01-01T12:05:00.000Z',
            }),
          });
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  // Seed session in localStorage with a valid fake JWT.
  await page.addInitScript((token) => {
    const fakeSession = {
      access_token: token,
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-1111-aaaa-1111-aaaaaaaaaaaa',
        email: 'driver@phase6-smoke.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2025-01-01T00:00:00.000Z',
      },
    };
    for (const k of [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token',
      'sb-localhost-auth-token',
    ]) {
      try {
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  }, FAKE_ACCESS_TOKEN);
}

test.describe('Phase 6 — driver operational controls', () => {
  test('pre-trip confirmation records and shows badge', async ({ page }) => {
    await installPhase6DriverMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Bus P6', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    const confirmButton = page.getByTestId('driver-confirm-pre-trip');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page.getByTestId('pre-trip-confirmed-badge')).toBeVisible({
      timeout: 10000,
    });
    await expect(confirmButton).toBeDisabled();
  });

  test('pause and resume trip transitions the status pill', async ({ page }) => {
    await installPhase6DriverMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Bus P6', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Initially active.
    await expect(page.getByTestId('driver-pause-trip')).toBeVisible();

    // Pause.
    await page.getByTestId('driver-pause-trip').click();
    await expect(page.getByTestId('driver-resume-trip')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('driver-pause-trip')).toHaveCount(0);

    // Resume.
    await page.getByTestId('driver-resume-trip').click();
    await expect(page.getByTestId('driver-pause-trip')).toBeVisible({ timeout: 10000 });
  });

  test('record exception submits successfully', async ({ page }) => {
    await installPhase6DriverMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Bus P6', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId('driver-record-exception-toggle').click();
    const form = page.getByTestId('driver-exception-form');
    await expect(form).toBeVisible();

    await page.getByLabel('Exception type').selectOption('traffic_delay');
    await page.getByLabel(/Short detail/).fill('railway crossing');
    await form.getByRole('button', { name: 'Record exception' }).click();

    await expect(page.getByText('Operational exception recorded.')).toBeVisible({
      timeout: 10000,
    });
  });

  test('cancel trip opens confirmation and clears the active trip', async ({ page }) => {
    await installPhase6DriverMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Bus P6', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId('driver-cancel-trip').click();
    const cancelDialog = page.getByLabel('Cancel this trip?');
    await expect(cancelDialog).toBeVisible({ timeout: 5000 });
    await cancelDialog.getByRole('button', { name: 'Cancel trip' }).click();

    await expect(page.getByText('Trip cancelled and recorded in the audit trail.')).toBeVisible({
      timeout: 10000,
    });
    // The scan prompt returns.
    await expect(page.getByRole('heading', { name: 'Scan the bus to start' })).toBeVisible({
      timeout: 10000,
    });
  });
});
