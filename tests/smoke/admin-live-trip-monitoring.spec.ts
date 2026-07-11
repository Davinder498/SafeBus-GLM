import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 4C — admin live trip monitoring smoke tests.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock returns an admin
 * profile (tenant_admin) so ProtectedRoute admits the caller to /admin/live-trips,
 * and returns a configurable list of active trips from the
 * get_admin_live_trip_monitoring RPC.
 *
 * Coverage:
 *   1. Page renders (heading + description).
 *   2. Empty state when the RPC returns no active trips.
 *   3. Active trip card renders with driver/bus/route/trip type/started time.
 *   4. No-location state (active trip, null latestLocationAt).
 *   5. Stale-location status (location older than 60s).
 *   6. Fresh-location status (location within 60s).
 */

const ADMIN = {
  profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  driverId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  busId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  routeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  tripId: '11111111-2222-3333-4444-555555555555',
} as const;

const adminProfile = {
  id: ADMIN.profileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

interface AdminLiveTripRpcRow {
  trip_id: string;
  tenant_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_email: string | null;
  bus_id: string;
  bus_label: string | null;
  route_id: string;
  route_name: string | null;
  trip_type: string | null;
  status: string;
  started_at: string;
  latest_latitude: number | null;
  latest_longitude: number | null;
  latest_location_at: string | null;
}

/** Build a single active-trip row with the given location state. */
function tripRow(opts: {
  latestLocationAt: string | null;
  latestLatitude?: number | null;
  latestLongitude?: number | null;
  routeName?: string | null;
  busLabel?: string | null;
  driverName?: string | null;
  tripId?: string;
}): AdminLiveTripRpcRow {
  return {
    trip_id: opts.tripId ?? ADMIN.tripId,
    tenant_id: ADMIN.tenantId,
    driver_id: ADMIN.driverId,
    driver_name: opts.driverName ?? 'Test Driver',
    driver_email: 'driver@smoke-test.local',
    bus_id: ADMIN.busId,
    bus_label: opts.busLabel ?? '12',
    route_id: ADMIN.routeId,
    route_name: opts.routeName ?? 'North Ridge Morning',
    trip_type: 'morning',
    status: 'active',
    started_at: '2025-01-01T12:00:00.000Z',
    latest_latitude: opts.latestLatitude ?? null,
    latest_longitude: opts.latestLongitude ?? null,
    latest_location_at: opts.latestLocationAt,
  };
}

/**
 * Install a Supabase mock for the admin live-trips page. Returns controls to
 * change the RPC response between tests. Must be called BEFORE page.goto.
 *
 * - setTrips(rows): change the trips returned by the next RPC call.
 * - failNextCall(): make the NEXT get_admin_live_trip_monitoring RPC call fail
 *   with a 500, then resume normal responses afterwards.
 */
async function installAdminMock(page: Page, initialTrips: AdminLiveTripRpcRow[] = []) {
  let tripsForRpc: AdminLiveTripRpcRow[] = initialTrips;
  let failNext = false;
  let failNextMessage = 'mock rpc failure';
  const setTrips = (rows: AdminLiveTripRpcRow[]) => {
    tripsForRpc = rows;
  };
  const failNextCall = (message = 'mock rpc failure') => {
    failNext = true;
    failNextMessage = message;
  };

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
            id: ADMIN.profileId,
            aud: 'authenticated',
            role: 'authenticated',
            email: adminProfile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: adminProfile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-admin-token',
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: ADMIN.profileId,
              email: adminProfile.email,
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
      // profiles: AuthContext loads the admin profile by id.
      if (method === 'GET' && path.includes('/profiles')) {
        const accept = route.request().headers()['accept'] ?? '';
        const wantsSingle = accept.includes('application/vnd.pgrst.object+json');
        if (wantsSingle) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(adminProfile),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([adminProfile]),
          });
        }
        return;
      }

      // RPC: get_admin_live_trip_monitoring (POST)
      if (method === 'POST' && path.includes('/rpc/get_admin_live_trip_monitoring')) {
        if (failNext) {
          failNext = false;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            // Mimic a raw backend/PostgREST error with sensitive detail.
            body: JSON.stringify({ message: failNextMessage }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tripsForRpc),
        });
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  // Seed a fake admin session in localStorage so supabase-js getSession() finds it.
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'mock-admin-token',
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'admin@smoke-test.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2025-01-01T00:00:00.000Z',
      },
    };
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) {
      try {
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  });

  return { setTrips, failNextCall };
}

test.describe('Admin live trip monitoring', () => {
  test('page renders with heading and description', async ({ page }) => {
    await installAdminMock(page, []);
    await page.goto('/admin/live-trips');

    await expect(page.getByRole('heading', { name: 'Live Trip Monitoring', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Monitor active driver trips and latest location updates for your organization.'),
    ).toBeVisible();
  });

  test('empty state renders when no active trips are returned', async ({ page }) => {
    await installAdminMock(page, []);
    await page.goto('/admin/live-trips');

    await expect(page.getByText('No active trips right now.')).toBeVisible();
  });

  test('active trip card renders with driver, bus, route, trip type, and started time', async ({ page }) => {
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: null,
        driverName: 'Avery Driver',
        busLabel: '42',
        routeName: 'Riverside AM',
      }),
    ]);
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Riverside AM')).toBeVisible();
    await expect(page.getByText(/Bus 42/)).toBeVisible();
    await expect(page.getByText('Driver: Avery Driver')).toBeVisible();
    await expect(page.getByText(/morning/i)).toBeVisible();
  });

  test('no-location state renders for an active trip without a location', async ({ page }) => {
    await installAdminMock(page, [tripRow({ latestLocationAt: null })]);
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Waiting for first location update.')).toBeVisible();
    await expect(page.getByText('No location yet')).toBeVisible();
  });

  test('stale-location status renders when the latest location is older than 60 seconds', async ({ page }) => {
    // A timestamp 2 minutes ago — beyond the 60s fresh threshold but within the
    // 5-minute offline threshold, so it classifies as 'stale'.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: twoMinutesAgo,
        latestLatitude: 51.0447,
        latestLongitude: -114.0719,
      }),
    ]);
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Location stale')).toBeVisible();
    // The lat/lng text should be present (not the "waiting" fallback).
    await expect(page.getByTestId('admin-live-trip-location')).toContainText('51.04');
  });

  test('offline-location status renders when the latest location is very stale', async ({ page }) => {
    // A timestamp 10 minutes ago — beyond the 5-minute offline threshold.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: tenMinutesAgo,
        latestLatitude: 51.0447,
        latestLongitude: -114.0719,
      }),
    ]);
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Location offline')).toBeVisible();
    await expect(page.getByTestId('admin-live-trip-location')).toContainText('51.04');
  });

  test('fresh-location status renders when the latest location is within 60 seconds', async ({ page }) => {
    // A timestamp 10 seconds ago — within the 60s fresh threshold.
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: tenSecondsAgo,
        latestLatitude: 51.0447,
        latestLongitude: -114.0719,
      }),
    ]);
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Live location fresh')).toBeVisible();
    await expect(page.getByTestId('admin-live-trip-location')).toContainText('51.04');
  });
});

test.describe('Admin live trip monitoring — operational refresh (4D)', () => {
  test('manual refresh button renders and can be clicked; last refreshed timestamp appears after load', async ({ page }) => {
    await installAdminMock(page, [
      tripRow({ latestLocationAt: null, routeName: 'Refreshable Route' }),
    ]);
    await page.goto('/admin/live-trips');

    // Refresh button is visible and enabled (not currently refreshing).
    const refreshButton = page.getByTestId('admin-live-trips-refresh-button');
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toBeEnabled();

    // Last refreshed timestamp is present after the initial successful load.
    await expect(page.getByTestId('admin-live-trips-last-refreshed')).toContainText('Last refreshed');

    // Click refresh; it should still be visible/enabled afterwards and the
    // trip card should remain visible (non-destructive).
    await refreshButton.click();
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(refreshButton).toBeEnabled();
  });

  test('refresh error after initial load shows a non-destructive error and keeps the existing trip visible', async ({ page }) => {
    const controls = await installAdminMock(page, [
      tripRow({ latestLocationAt: null, routeName: 'Survivor Route' }),
    ]);
    await page.goto('/admin/live-trips');

    // Initial load succeeded: trip is visible.
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Survivor Route')).toBeVisible();

    // Make the next RPC call fail, then click refresh.
    controls.failNextCall();
    await page.getByTestId('admin-live-trips-refresh-button').click();

    // Non-destructive refresh error appears.
    await expect(page.getByTestId('admin-live-trips-refresh-error')).toBeVisible();

    // The existing trip is STILL visible (list was not wiped).
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Survivor Route')).toBeVisible();
  });

  test('all four freshness labels render across fresh, stale, offline, and no-location trips', async ({ page }) => {
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Each trip gets a unique trip_id to avoid React key collisions.
    await installAdminMock(page, [
      tripRow({ tripId: '11111111-0000-0000-0000-000000000001', latestLocationAt: tenSecondsAgo, latestLatitude: 51.0, latestLongitude: -114.0, routeName: 'Fresh Route' }),
      tripRow({ tripId: '11111111-0000-0000-0000-000000000002', latestLocationAt: twoMinutesAgo, latestLatitude: 51.1, latestLongitude: -114.1, routeName: 'Stale Route' }),
      tripRow({ tripId: '11111111-0000-0000-0000-000000000003', latestLocationAt: tenMinutesAgo, latestLatitude: 51.2, latestLongitude: -114.2, routeName: 'Offline Route' }),
      tripRow({ tripId: '11111111-0000-0000-0000-000000000004', latestLocationAt: null, routeName: 'No Location Route' }),
    ]);
    await page.goto('/admin/live-trips');

    // Wait for the cards to render.
    await expect(page.getByTestId('admin-live-trip-card')).toHaveCount(4);

    // Each label is visible somewhere on the page.
    await expect(page.getByText('Live location fresh')).toBeVisible();
    await expect(page.getByText('Location stale')).toBeVisible();
    await expect(page.getByText('Location offline')).toBeVisible();
    await expect(page.getByText('No location yet')).toBeVisible();
  });

  test('initial load failure: raw backend error is not visible; generic error is visible', async ({ page }) => {
    // Mock the very first RPC call to fail with a raw backend-like message
    // that must NEVER appear in the UI.
    const rawBackendMessage = 'permission denied for function get_admin_live_trip_monitoring';
    const controls = await installAdminMock(page, []);
    controls.failNextCall(rawBackendMessage);
    await page.goto('/admin/live-trips');

    // The generic initial error state is shown.
    await expect(page.getByTestId('admin-live-trips-error')).toBeVisible();
    await expect(page.getByText('We could not load active trips.')).toBeVisible();

    // The raw backend detail must NOT be visible anywhere on the page.
    await expect(page.getByText(rawBackendMessage)).toHaveCount(0);
  });

  test('refresh failure: raw backend error is not visible; generic refresh error is visible and existing trip remains', async ({ page }) => {
    const rawBackendMessage = 'violates row-level security policy on driver_trips';
    const controls = await installAdminMock(page, [
      tripRow({ latestLocationAt: null, routeName: 'Survivor Route' }),
    ]);
    await page.goto('/admin/live-trips');

    // Initial load succeeded: trip is visible.
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Survivor Route')).toBeVisible();

    // Make the next RPC call fail with a raw backend-like message, then refresh.
    controls.failNextCall(rawBackendMessage);
    await page.getByTestId('admin-live-trips-refresh-button').click();

    // The generic refresh error is shown.
    await expect(page.getByTestId('admin-live-trips-refresh-error')).toBeVisible();
    await expect(
      page.getByText('Refresh failed. The last successful list is still shown.'),
    ).toBeVisible();

    // The raw backend detail must NOT be visible anywhere on the page.
    await expect(page.getByText(rawBackendMessage)).toHaveCount(0);

    // The existing trip is STILL visible (list was not wiped).
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('Survivor Route')).toBeVisible();
  });

  test('no-school active trip renders cleanly on /admin/live-trips (4E regression)', async ({ page }) => {
    // The get_admin_live_trip_monitoring RPC does not return school_id, so a
    // trip whose bus/route have school_id = null renders the same as any other
    // trip. This test protects the 4E/4D interaction: a school-less active trip
    // must appear with no null/undefined display issue.
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: tenSecondsAgo,
        latestLatitude: 51.0447,
        latestLongitude: -114.0719,
        routeName: 'No School Route',
        busLabel: '77',
        driverName: 'Driver Without School',
      }),
    ]);
    await page.goto('/admin/live-trips');

    // The trip card renders with the route name and bus label.
    await expect(page.getByTestId('admin-live-trip-card')).toBeVisible();
    await expect(page.getByText('No School Route')).toBeVisible();
    await expect(page.getByText(/Bus 77/)).toBeVisible();
    await expect(page.getByText('Driver: Driver Without School')).toBeVisible();

    // No ugly null/undefined text appears anywhere on the page.
    await expect(page.getByText('null', { exact: true })).toHaveCount(0);
    await expect(page.getByText('undefined', { exact: true })).toHaveCount(0);

    // Fresh location label renders (the trip has a fresh location).
    await expect(page.getByText('Live location fresh')).toBeVisible();
  });
});
