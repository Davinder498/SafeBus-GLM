import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const IDS = {
  adminProfileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  rawTripId: '11111111-2222-3333-4444-555555555555',
  rawBusId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
} as const;

function profile(role: 'tenant_admin' | 'guardian' | 'driver') {
  return {
    id: IDS.adminProfileId,
    tenant_id: IDS.tenantId,
    school_id: null,
    full_name: role === 'tenant_admin' ? 'Test Admin' : role === 'guardian' ? 'Test Guardian' : 'Test Driver',
    email: `${role}@smoke-test.local`,
    role,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
}

interface AdminLiveTripRpcRow {
  bus_label: string | null;
  route_name: string | null;
  driver_name: string | null;
  trip_type: string | null;
  status: string;
  started_at: string;
  latest_latitude: number | null;
  latest_longitude: number | null;
  latest_location_at: string | null;
  speed_mps: number | null;
  location_status: 'live' | 'stale' | 'missing';
  issue_label: 'OK' | 'Stale GPS' | 'Missing GPS' | 'Speed unavailable' | 'Needs attention';
}

function tripRow(opts: Partial<AdminLiveTripRpcRow> = {}): AdminLiveTripRpcRow {
  return {
    bus_label: '12',
    route_name: 'North Ridge Morning',
    driver_name: 'Avery Driver',
    trip_type: 'morning',
    status: 'active',
    started_at: '2025-01-01T12:00:00.000Z',
    latest_latitude: null,
    latest_longitude: null,
    latest_location_at: null,
    speed_mps: null,
    location_status: 'missing',
    issue_label: 'Missing GPS',
    ...opts,
  };
}

async function installMock(page: Page, opts: { role?: 'tenant_admin' | 'guardian' | 'driver'; trips?: AdminLiveTripRpcRow[]; session?: boolean } = {}) {
  const currentProfile = profile(opts.role ?? 'tenant_admin');
  let tripsForRpc = opts.trips ?? [];
  let failNext = false;
  let failNextMessage = 'mock rpc failure';

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }

    const method = route.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        if (opts.session === false) {
          await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: IDS.adminProfileId,
            aud: 'authenticated',
            role: 'authenticated',
            email: currentProfile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: currentProfile.created_at,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (path.startsWith('/rest/v1/')) {
      if (method === 'GET' && path.includes('/profiles')) {
        const wantsSingle = (route.request().headers().accept ?? '').includes('application/vnd.pgrst.object+json');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsSingle ? currentProfile : [currentProfile]) });
        return;
      }

      if (method === 'POST' && path.includes('/rpc/get_admin_live_fleet_monitoring')) {
        if (failNext) {
          failNext = false;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: failNextMessage }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tripsForRpc) });
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  if (opts.session !== false) {
    await page.addInitScript(({ email }) => {
      const fakeSession = {
        access_token: 'mock-admin-token',
        refresh_token: 'mock-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00.000Z' },
      };
      for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) {
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      }
    }, { email: currentProfile.email });
  }

  return {
    setTrips(rows: AdminLiveTripRpcRow[]) { tripsForRpc = rows; },
    failNextCall(message = 'mock rpc failure') { failNext = true; failNextMessage = message; },
  };
}

test.describe('Admin live fleet monitoring', () => {
  test('unauthenticated user cannot access admin live fleet page', async ({ page }) => {
    await installMock(page, { session: false });
    await page.goto('/admin/live-trips');
    await expect(page.getByText('Sign in required')).toBeVisible();
  });

  test('guardian cannot access admin live fleet page', async ({ page }) => {
    await installMock(page, { role: 'guardian' });
    await page.goto('/admin/live-trips');
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('driver cannot access admin live fleet page', async ({ page }) => {
    await installMock(page, { role: 'driver' });
    await page.goto('/admin/live-trips');
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('tenant admin can access live fleet map, summary, list, speed, stale, and missing GPS states', async ({ page }) => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    await installMock(page, {
      trips: [
        tripRow({ bus_label: '42', route_name: 'Riverside AM', latest_latitude: 51.0447, latest_longitude: -114.0719, latest_location_at: now, speed_mps: 12.4, location_status: 'live', issue_label: 'OK' }),
        tripRow({ bus_label: '77', route_name: 'Stale Route', latest_latitude: 51.05, latest_longitude: -114.08, latest_location_at: stale, location_status: 'stale', issue_label: 'Stale GPS' }),
        tripRow({ bus_label: '88', route_name: 'Missing Route', location_status: 'missing', issue_label: 'Missing GPS' }),
      ],
    });
    await page.goto('/admin/live-trips');

    await expect(page.getByRole('heading', { name: 'Live Fleet Monitoring', level: 1 })).toBeVisible();
    await expect(page.getByTestId('admin-live-fleet-summary')).toContainText('Active trips / buses');
    await expect(page.getByTestId('admin-live-fleet-map-config-missing')).toBeVisible();
    await expect(page.getByTestId('admin-live-fleet-map-marker')).toHaveCount(2);
    await expect(page.getByText('Bus 42')).toBeVisible();
    await expect(page.getByText('Riverside AM')).toBeVisible();
    await expect(page.getByText('Avery Driver')).toBeVisible();
    await expect(page.getByText('45 km/h')).toBeVisible();
    await expect(page.getByText('Speed unavailable')).toBeVisible();
    await expect(page.getByText('Stale GPS')).toBeVisible();
    await expect(page.getByText('Missing GPS')).toBeVisible();
  });

  test('empty map state renders when active buses have no valid coordinates', async ({ page }) => {
    await installMock(page, { trips: [tripRow({ route_name: 'No GPS Route' })] });
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-fleet-map-empty')).toBeVisible();
    await expect(page.getByTestId('admin-live-fleet-map-config-missing')).toBeVisible();
    await expect(page.getByText('No active buses with valid coordinates.')).toBeVisible();
    await expect(page.getByText('No GPS Route')).toBeVisible();
  });


  test('invalid coordinates are excluded from the fallback map summary without hiding table rows', async ({ page }) => {
    await installMock(page, {
      trips: [
        tripRow({ bus_label: '10', route_name: 'Valid Route', latest_latitude: 51.0447, latest_longitude: -114.0719, latest_location_at: new Date().toISOString(), location_status: 'live', issue_label: 'OK' }),
        tripRow({ bus_label: '99', route_name: 'Invalid Route', latest_latitude: 999, latest_longitude: -114.0719, latest_location_at: new Date().toISOString(), location_status: 'missing', issue_label: 'Missing GPS' }),
      ],
    });
    await page.goto('/admin/live-trips');

    await expect(page.getByTestId('admin-live-fleet-map-marker')).toHaveCount(1);
    await expect(page.getByTestId('admin-live-fleet-map-fallback')).toContainText('Valid Route');
    await expect(page.getByTestId('admin-live-fleet-map-fallback')).not.toContainText('Invalid Route');
    await expect(page.getByTestId('admin-live-trips-list')).toContainText('Invalid Route');
  });

  test('manual refresh keeps existing list on generic refresh failure', async ({ page }) => {
    const controls = await installMock(page, { trips: [tripRow({ route_name: 'Survivor Route' })] });
    await page.goto('/admin/live-trips');
    await expect(page.getByText('Survivor Route')).toBeVisible();

    controls.failNextCall('violates row-level security policy on driver_trips');
    await page.getByTestId('admin-live-trips-refresh-button').click();

    await expect(page.getByTestId('admin-live-trips-refresh-error')).toBeVisible();
    await expect(page.getByText('Refresh failed. The last successful list is still shown.')).toBeVisible();
    await expect(page.getByText('violates row-level security policy on driver_trips')).toHaveCount(0);
    await expect(page.getByText('Survivor Route')).toBeVisible();
  });

  test('sensitive mocked values are not rendered', async ({ page }) => {
    await installMock(page, {
      trips: [tripRow({
        route_name: 'Safe Route',
        driver_name: 'Visible Driver',
        latest_latitude: 51.0447,
        latest_longitude: -114.0719,
        latest_location_at: new Date().toISOString(),
        speed_mps: 8,
        location_status: 'live',
        issue_label: 'OK',
      })],
    });
    await page.goto('/admin/live-trips');

    for (const forbidden of [
      'Student Sensitive',
      'Guardian Sensitive',
      'guardian@example.test',
      'driver-phone@example.test',
      IDS.tenantId,
      IDS.rawTripId,
      IDS.rawBusId,
      '123 Home Address Lane',
      'medical note value',
    ]) {
      await expect(page.getByText(forbidden)).toHaveCount(0);
    }
  });
});
