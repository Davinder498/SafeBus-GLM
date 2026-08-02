import { expect, test, type Page, type Route } from '@playwright/test';

const tenantId = '22222222-2222-2222-2222-222222222222';
const busId = '33333333-3333-3333-3333-333333333333';
const serviceId = '44444444-4444-4444-4444-444444444444';
const profile = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: tenantId,
  school_id: null,
  full_name: 'Bus Admin',
  email: 'bus-admin@example.test',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const bus = {
  id: busId,
  tenant_id: tenantId,
  school_id: null,
  school_name: null,
  bus_number: 'AF02',
  license_plate: 'CPK1452',
  capacity: 50,
  status: 'active',
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
};

async function mockBusWorkspace(page: Page) {
  let routeEnded = false;
  let runReady = false;
  let hasActiveQr = false;
  const routeAssignments = [
    {
      id: serviceId,
      tenant_id: tenantId,
      bus_id: busId,
      route_id: 'route-current',
      route_trip_pattern_id: 'pattern-current',
      trip_type: 'morning',
      effective_from: '2026-01-01',
      effective_to: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      route_name: 'Downtown',
      route_code: 'DR02',
      route_status: 'active',
      trip_name: 'Outbound',
      direction: 'forward',
      has_active_trip: false,
    },
    {
      id: 'service-upcoming',
      tenant_id: tenantId,
      bus_id: busId,
      route_id: 'route-upcoming',
      route_trip_pattern_id: 'pattern-upcoming',
      trip_type: 'evening',
      effective_from: '2099-01-01',
      effective_to: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      route_name: 'Future Route',
      route_code: 'FR01',
      route_status: 'active',
      trip_name: 'Return',
      direction: 'reverse',
      has_active_trip: false,
    },
    {
      id: 'service-history',
      tenant_id: tenantId,
      bus_id: busId,
      route_id: 'route-history',
      route_trip_pattern_id: 'pattern-history',
      trip_type: 'morning',
      effective_from: '2025-01-01',
      effective_to: '2025-06-01',
      status: 'inactive',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-06-01T00:00:00Z',
      route_name: 'Old Route',
      route_code: 'OLD1',
      route_status: 'inactive',
      trip_name: 'Old Outbound',
      direction: 'forward',
      has_active_trip: false,
    },
  ];
  const drivers = [
    {
      id: 'driver-1',
      tenant_id: tenantId,
      profile_id: 'driver-profile-1',
      employee_number: null,
      phone: '4035550101',
      license_number: 'AB-1',
      license_issue_date: '2025-01-01',
      license_expiry_date: '2028-01-01',
      license_class: '2',
      address_line1: '1 Main St',
      address_line2: null,
      city: 'Calgary',
      province: 'AB',
      postal_code: 'T1T 1T1',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'driver-2',
      tenant_id: tenantId,
      profile_id: 'driver-profile-2',
      employee_number: null,
      phone: '4035550102',
      license_number: 'AB-2',
      license_issue_date: '2025-01-01',
      license_expiry_date: '2028-01-01',
      license_class: '2',
      address_line1: '2 Main St',
      address_line2: null,
      city: 'Calgary',
      province: 'AB',
      postal_code: 'T1T 1T2',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  const driverProfiles = [
    {
      ...profile,
      id: 'driver-profile-1',
      full_name: 'Driver One',
      email: 'one@example.test',
      role: 'driver',
    },
    {
      ...profile,
      id: 'driver-profile-2',
      full_name: 'Driver Two',
      email: 'two@example.test',
      role: 'driver',
    },
  ];

  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: 'test',
        refresh_token: 'test',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: user.id,
          email: user.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: user.created_at,
        },
      };
      for (const key of [
        'supabase.auth.token',
        'sb-placeholder-auth-token',
        'sb-bppmqykkbhrmotcybxrh-auth-token',
        'sb-localhost-auth-token',
      ]) {
        window.localStorage.setItem(key, JSON.stringify(session));
      }
    },
    { user: profile },
  );

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return route.fallback();
    const path = url.pathname;
    const method = route.request().method();
    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          path.endsWith('/user')
            ? { id: profile.id, email: profile.email, role: 'authenticated', aud: 'authenticated' }
            : {},
        ),
      });
    }
    if (path.includes('/rpc/get_admin_bus_workspace')) {
      const currentRoutes = routeEnded
        ? routeAssignments.map((item) =>
            item.id === serviceId ? { ...item, status: 'inactive' } : item,
          )
        : routeAssignments;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bus,
          routeAssignments: currentRoutes,
          driverAssignments: [
            {
              id: 'assignment-1',
              tenant_id: tenantId,
              driver_id: 'driver-1',
              bus_id: busId,
              route_id: 'route-current',
              route_trip_pattern_id: 'pattern-current',
              bus_route_assignment_id: serviceId,
              trip_type: 'morning',
              status: routeEnded ? 'inactive' : 'active',
              effective_from: '2026-01-01',
              effective_to: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              driver_name: 'Driver One',
              driver_email: 'one@example.test',
              has_active_trip: false,
            },
          ],
          studentAssignments: [
            {
              id: 'student-assignment-1',
              tenant_id: tenantId,
              student_id: 'student-1',
              bus_route_assignment_id: serviceId,
              route_trip_pattern_id: 'pattern-current',
              pickup_stop_id: 'stop-1',
              dropoff_stop_id: 'stop-2',
              effective_from: '2026-01-01',
              effective_to: null,
              status: routeEnded ? 'inactive' : 'active',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              student_name: 'Avery Johnson',
              pickup_stop_name: 'First Stop',
              dropoff_stop_name: 'Last Stop',
            },
          ],
        }),
      });
    }
    if (path.includes('/rpc/get_admin_bus_ready_dispatch')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          runReady
            ? [
                {
                  dispatch_id: 'dispatch-1',
                  bus_id: busId,
                  bus_route_assignment_id: serviceId,
                  service_date: '2026-08-01',
                  status: 'ready',
                  route_name: 'Downtown',
                  route_code: 'DR02',
                  trip_name: 'Outbound',
                  prepared_at: '2026-08-01T12:00:00Z',
                },
              ]
            : [],
        ),
      });
    }
    if (path.includes('/rpc/prepare_bus_run')) {
      runReady = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (path.includes('/rpc/get_admin_bus_qr_credential_status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            bus_id: busId,
            has_active_credential: hasActiveQr,
            credential_status: hasActiveQr ? 'active' : null,
            credential_created_at: hasActiveQr ? '2026-08-01T12:00:00Z' : null,
          },
        ]),
      });
    }
    if (path.includes('/rpc/manage_bus_qr_credential')) {
      const body = route.request().postDataJSON() as { p_action?: string };
      hasActiveQr = body.p_action !== 'revoke';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            bus_id: busId,
            credential_id: hasActiveQr ? 'credential-1' : null,
            status: hasActiveQr ? 'active' : 'revoked',
            raw_token: hasActiveQr ? `sbus_bus_v1_${'A'.repeat(43)}` : null,
            created_at: '2026-08-01T12:00:00Z',
          },
        ]),
      });
    }
    if (path.includes('/rpc/admin_end_bus_route_assignment')) {
      routeEnded = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (path.includes('/profiles')) {
      const single = (route.request().headers().accept ?? '').includes('object+json');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? profile : [profile, ...driverProfiles]),
      });
    }
    if (path.includes('/rest/v1/buses') && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(bus),
      });
    }
    if (path.includes('/rest/v1/drivers')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(drivers),
      });
    }
    if (path.includes('/rest/v1/routes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (path.includes('/rest/v1/route_trip_patterns')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (path.includes('/rest/v1/route_stops')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'stop-1',
            tenant_id: tenantId,
            route_id: 'route-current',
            stop_name: 'First Stop',
            stop_order: 1,
            status: 'active',
          },
          {
            id: 'stop-2',
            tenant_id: tenantId,
            route_id: 'route-current',
            stop_name: 'Last Stop',
            stop_order: 2,
            status: 'active',
          },
        ]),
      });
    }
    if (path.includes('/rest/v1/schools')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test.describe('unified bus workspace', () => {
  test('creates bus details before unlocking assignment tabs', async ({ page }) => {
    await mockBusWorkspace(page);
    await page.goto('/admin/buses/new');

    await expect(page.getByRole('tab', { name: 'Routes' })).toBeDisabled();
    await expect(page.getByRole('tab', { name: 'Drivers' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Students' })).toBeDisabled();

    await page.getByLabel('Bus number').fill('AF02');
    await page.getByLabel('License plate').fill('CPK1452');
    await page.getByLabel('Capacity').fill('50');
    await page.getByRole('button', { name: 'Save bus' }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/buses/${busId}\\?tab=routes`));
    await expect(page.getByRole('tab', { name: 'Routes' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Assign route trip' })).toBeVisible();
  });

  test('shows route history, prepares one run, and manages students', async ({ page }) => {
    await mockBusWorkspace(page);
    await page.goto(`/admin/buses/${busId}?tab=routes`);

    await expect(page.getByRole('heading', { name: 'Current' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    await page.getByRole('button', { name: 'Make next run' }).first().click();
    await expect(page.getByText(/Any active driver can scan its QR to start/)).toBeVisible();
    await expect(page.getByText('Ready for driver scan')).toBeVisible();

    await page.getByRole('tab', { name: 'Students' }).click();
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('Pickup: First Stop')).toBeVisible();

    await page.getByRole('tab', { name: 'Routes' }).click();
    await page.getByRole('button', { name: 'End assignment' }).first().click();
    await page.getByRole('button', { name: 'End route trip' }).click();
    await expect(
      page.getByText('Route trip and its linked active assignments were ended.'),
    ).toBeVisible();
  });

  test('generates a printable, revocable bus QR credential', async ({ page }) => {
    await mockBusWorkspace(page);
    await page.goto(`/admin/buses/${busId}`);
    await expect(page.getByTestId('admin-bus-qr-panel')).toContainText('No active QR');
    await page.getByRole('button', { name: 'Generate QR' }).click();
    await expect(page.getByTestId('admin-bus-qr-result')).toBeVisible();
    await expect(page.getByAltText('Driver scan QR for Bus AF02')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace QR' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Revoke QR' })).toBeEnabled();
  });
});
