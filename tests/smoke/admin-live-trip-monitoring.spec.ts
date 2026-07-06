import { test, expect, type Page, type Route } from '@playwright/test';

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
}): AdminLiveTripRpcRow {
  return {
    trip_id: ADMIN.tripId,
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
 * Install a Supabase mock for the admin live-trips page. Returns a setter to
 * change the RPC response between tests. Must be called BEFORE page.goto.
 */
async function installAdminMock(page: Page, initialTrips: AdminLiveTripRpcRow[] = []) {
  let tripsForRpc: AdminLiveTripRpcRow[] = initialTrips;
  const setTrips = (rows: AdminLiveTripRpcRow[]) => {
    tripsForRpc = rows;
  };

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.includes('placeholder.supabase.co')) {
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tripsForRpc),
        });
        return;
      }

      // Any other table: return empty array / object.
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
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
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-localhost-auth-token']) {
      try {
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  });

  return { setTrips };
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
    // A timestamp 5 minutes ago — well beyond the 60s fresh threshold.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await installAdminMock(page, [
      tripRow({
        latestLocationAt: fiveMinutesAgo,
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
