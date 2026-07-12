import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 4E — Transportation Domain Model Alignment smoke tests.
 *
 * Verifies that school is no longer required for core transportation operations:
 *   - Admin route form can be submitted with no school selected.
 *   - Admin bus form can be submitted with no school selected.
 *   - Driver dashboard can start a trip with a bus + route that have no school.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock pattern follows the
 * proven admin-live-trip-monitoring.spec.ts setup.
 */

const ADMIN = {
  profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  driverId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  driverProfileId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  busId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  routeId: '11111111-2222-3333-4444-555555555555',
  tripId: '22222222-3333-4444-5555-666666666666',
  assignmentId: '33333333-4444-5555-6666-777777777777',
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

const driverProfileRow = {
  id: ADMIN.driverProfileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Test Driver',
  email: 'driver@smoke-test.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

/** A bus with no school_id (the 4E domain model). */
const busNoSchool = {
  id: ADMIN.busId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  bus_number: '42',
  license_plate: 'SB-42',
  capacity: 48,
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

/** A route with no school_id (the 4E domain model). */
const routeNoSchool = {
  id: ADMIN.routeId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  route_name: 'Riverside AM',
  route_code: 'RIV-AM',
  route_type: 'morning',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const driverRow = {
  id: ADMIN.driverId,
  tenant_id: ADMIN.tenantId,
  profile_id: ADMIN.driverProfileId,
  employee_number: 'DRV-001',
  phone: null,
  status: 'active',
};

/**
 * Install a Supabase mock that returns an admin (or driver) profile and
 * no-school bus/route data. Handles route + bus POST inserts. For driver trips,
 * tracks the active trip so a POST insert is visible on subsequent GETs (this
 * mirrors the driver dashboard's start-trip -> refresh flow). Must be called
 * BEFORE page.goto.
 */
async function installTransportMock(page: Page, profile: typeof adminProfile = adminProfile) {
  // Track the active driver trip so the mock can return it after a start-trip POST.
  let activeTrip: Record<string, unknown> | null = null;

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
            id: profile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: profile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: profile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-transport-token',
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
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
            await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ message: 'no rows' }) });
            return;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0]) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      };

      // GET selects
      if (method === 'GET') {
        if (path.includes('/profiles')) {
          await fulfillRows([profile]);
          return;
        }
        if (path.includes('/schools')) {
          await fulfillRows([]);
          return;
        }
        if (path.includes('/buses')) {
          await fulfillRows([busNoSchool]);
          return;
        }
        if (path.includes('/routes')) {
          await fulfillRows([routeNoSchool]);
          return;
        }
        if (path.includes('/drivers')) {
          if (profile.role === 'driver') {
            await fulfillRows([driverRow]);
          } else {
            await fulfillRows([]);
          }
          return;
        }
        if (path.includes('/driver_trips')) {
          // Return the tracked active trip (if any).
          await fulfillRows(activeTrip ? [activeTrip] : []);
          return;
        }
        if (path.includes('/driver_route_assignments')) {
          // Return a mock assignment referencing the no-school bus + route.
          await fulfillRows([{
            id: ADMIN.assignmentId,
            tenant_id: ADMIN.tenantId,
            driver_id: ADMIN.driverId,
            bus_id: ADMIN.busId,
            route_id: ADMIN.routeId,
            trip_type: 'morning',
            status: 'active',
            effective_from: null,
            effective_to: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
          }]);
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      // POST (insert a route, bus, or driver_trip)
      if (method === 'POST') {
        if (path.includes('/rpc/start_driver_trip_from_assignment')) {
          // Start a trip from an assignment — return a new active trip.
          const newTrip = {
            id: ADMIN.tripId,
            tenant_id: ADMIN.tenantId,
            driver_id: ADMIN.driverId,
            bus_id: ADMIN.busId,
            route_id: ADMIN.routeId,
            trip_type: 'morning',
            status: 'active',
            service_date: '2025-01-01',
            started_at: '2025-01-01T12:00:00.000Z',
            ended_at: null,
            created_at: '2025-01-01T12:00:00.000Z',
            updated_at: '2025-01-01T12:00:00.000Z',
          };
          activeTrip = newTrip;
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newTrip) });
          return;
        }
        if (path.includes('/routes')) {
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(routeNoSchool) });
          return;
        }
        if (path.includes('/buses')) {
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(busNoSchool) });
          return;
        }
        if (path.includes('/driver_trips')) {
          const newTrip = {
            id: ADMIN.tripId,
            tenant_id: ADMIN.tenantId,
            driver_id: ADMIN.driverId,
            bus_id: ADMIN.busId,
            route_id: ADMIN.routeId,
            trip_type: 'morning',
            status: 'active',
            service_date: '2025-01-01',
            started_at: '2025-01-01T12:00:00.000Z',
            ended_at: null,
            created_at: '2025-01-01T12:00:00.000Z',
            updated_at: '2025-01-01T12:00:00.000Z',
          };
          activeTrip = newTrip;
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newTrip) });
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

  // Seed session in localStorage (same keys as the proven 4C mock).
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'mock-transport-token',
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
}

test.describe('Milestone 4E — school optional for transportation', () => {
  test('admin route form can be submitted with no school selected', async ({ page }) => {
    await installTransportMock(page);
    await page.goto('/admin/routes');

    // Wait for the page to load past ProtectedRoute.
    await expect(page.getByRole('heading', { name: 'Routes and stops', level: 1 })).toBeVisible({ timeout: 10000 });

    // Open the add-route form.
    await page.getByRole('button', { name: 'Add route' }).click();

    // The School field is labeled optional.
    await expect(page.getByText('School (optional)')).toBeVisible();

    // Fill route name + code but leave school at "No school selected".
    await page.getByLabel('Route name').fill('Riverside AM');
    await page.getByLabel('Route code').fill('RIV-AM');

    // The school select shows "No school selected" by default (empty value).
    await expect(page.getByLabel('School (optional)')).toHaveValue('');

    // Submit the form.
    await page.getByRole('button', { name: 'Save route' }).click();

    // No "Choose a school" validation error appears (school is optional now).
    await expect(page.getByText('Choose a school')).toHaveCount(0);

    // A success message appears (the mock insert returns the route).
    await expect(page.getByText('Route created.')).toBeVisible({ timeout: 10000 });
  });

  test('admin bus form can be submitted with no school selected', async ({ page }) => {
    await installTransportMock(page);
    await page.goto('/admin/buses');

    // Wait for the page to load past ProtectedRoute.
    await expect(page.getByRole('heading', { name: 'Visible buses', level: 1 })).toBeVisible({ timeout: 10000 });

    // Open the add-bus form.
    await page.getByRole('button', { name: 'Add bus' }).click();

    // The School field is labeled optional.
    await expect(page.getByText('School (optional)')).toBeVisible();

    // Fill bus number but leave school at "Not assigned".
    await page.getByLabel('Bus number').fill('42');

    // Submit the form.
    await page.getByRole('button', { name: 'Save bus' }).click();

    // No school-required validation error appears.
    await expect(page.getByText('Choose a school')).toHaveCount(0);

    // A success message appears.
    await expect(page.getByText('Bus created.')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Milestone 4E — driver trip start with no-school bus + route', () => {
  test('driver can start a trip using a bus and route that have no school', async ({ page }) => {
    // Use a driver profile for this test. The init script seeds a session with
    // the driver's profile id.
    await installTransportMock(page, driverProfileRow);

    // Override the seeded session user id to match the driver profile.
    await page.addInitScript(() => {
      const fakeSession = {
        access_token: 'mock-driver-token',
        refresh_token: 'mock-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          email: 'driver@smoke-test.local',
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

    await page.goto('/driver');

    // The driver dashboard renders.
    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible({ timeout: 10000 });

    // The assignment card appears (the no-school bus + route are assigned).
    await expect(page.getByTestId('driver-assignment-card')).toBeVisible({ timeout: 10000 });

    // Start the trip from the assignment — no school field blocks the action.
    await page.getByTestId('driver-assignment-start-button').click();

    // The active trip card appears with the route name.
    await expect(page.getByRole('heading', { name: 'Riverside AM' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('active', { exact: true })).toBeVisible();
  });
});
