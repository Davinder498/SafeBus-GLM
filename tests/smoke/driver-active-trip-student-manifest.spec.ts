import { test, expect, type Page, type Route } from '@playwright/test';

const DRIVER = {
  profileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  tripId: '33333333-3333-3333-3333-333333333333',
  studentId: '44444444-4444-4444-4444-444444444444',
} as const;

const driverProfile = {
  id: DRIVER.profileId,
  tenant_id: DRIVER.tenantId,
  school_id: null,
  full_name: 'Test Driver',
  email: 'driver@smoke-test.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const guardianProfile = {
  ...driverProfile,
  id: '55555555-5555-5555-5555-555555555555',
  full_name: 'Test Guardian',
  email: 'guardian@smoke-test.local',
  role: 'guardian',
};

const adminProfile = {
  ...driverProfile,
  id: '66666666-6666-6666-6666-666666666666',
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
};

type MockProfile = typeof driverProfile | typeof guardianProfile | typeof adminProfile;

interface DriverManifestRpcRow {
  active_trip_id: string;
  student_id: string | null;
  student_display_name: string | null;
  route_name: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
  latitude?: number;
  longitude?: number;
  speed_mps?: number;
  eta?: string;
  guardian_email?: string;
}

function manifestRow(): DriverManifestRpcRow {
  return {
    active_trip_id: DRIVER.tripId,
    student_id: DRIVER.studentId,
    student_display_name: 'Avery Johnson',
    route_name: 'North Ridge Morning',
    trip_status: 'active',
    trip_direction: 'morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    assignment_status: 'active',
    latitude: 51.0447,
    longitude: -114.0719,
    speed_mps: 8.5,
    eta: '8:15 AM',
    guardian_email: 'guardian@example.test',
  };
}

function activeTripNoStudentsRow(): DriverManifestRpcRow {
  return {
    active_trip_id: DRIVER.tripId,
    student_id: null,
    student_display_name: null,
    route_name: 'North Ridge Morning',
    trip_status: 'active',
    trip_direction: 'morning',
    pickup_stop_name: null,
    dropoff_stop_name: null,
    assignment_status: null,
  };
}

async function installDriverManifestMock(
  page: Page,
  opts: {
    profile?: MockProfile;
    rows?: DriverManifestRpcRow[];
    failRpc?: boolean;
    rawError?: string;
  } = {},
) {
  const profile = opts.profile ?? driverProfile;
  const rows = opts.rows ?? [];
  const rawError =
    opts.rawError ?? 'permission denied for function get_driver_active_trip_student_manifest';

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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: profile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: profile.email,
            app_metadata: {},
            user_metadata: {},
            created_at: profile.created_at,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (path.startsWith('/rest/v1/')) {
      const accept = route.request().headers()['accept'] ?? '';
      const wantsSingle = accept.includes('application/vnd.pgrst.object+json');

      if (method === 'GET' && path.includes('/profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(wantsSingle ? profile : [profile]),
        });
        return;
      }

      if (method === 'POST' && path.includes('/rpc/get_driver_active_trip_student_manifest')) {
        if (opts.failRpc) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: rawError }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rows),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    await route.fallback();
  });

  await page.addInitScript((profileForSession: MockProfile) => {
    const session = {
      access_token: 'mock-driver-manifest-token',
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: profileForSession.id,
        email: profileForSession.email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: profileForSession.created_at,
      },
    };
    for (const key of [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token',
      'sb-localhost-auth-token',
    ]) {
      try {
        window.localStorage.setItem(key, JSON.stringify(session));
      } catch {
        /* ignore */
      }
    }
  }, profile);
}

test.describe('Milestone 7A - Driver active trip student manifest', () => {
  test('logged-out user is blocked from driver manifest page', async ({ page }) => {
    await page.goto('/driver/manifest');

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('guardian user is blocked from driver manifest page', async ({ page }) => {
    await installDriverManifestMock(page, { profile: guardianProfile });
    await page.goto('/driver/manifest');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/parent',
    );
    await expect(page.getByRole('heading', { name: 'Student Manifest', level: 1 })).toHaveCount(0);
  });

  test('admin user is blocked from driver manifest page', async ({ page }) => {
    await installDriverManifestMock(page, { profile: adminProfile });
    await page.goto('/driver/manifest');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(page.getByRole('heading', { name: 'Student Manifest', level: 1 })).toHaveCount(0);
  });

  test('driver can access manifest and see safe assigned student content', async ({ page }) => {
    await installDriverManifestMock(page, { rows: [manifestRow()] });
    await page.goto('/driver/manifest');

    await expect(page.getByRole('heading', { name: 'Student Manifest', level: 1 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('driver-manifest-student-card')).toBeVisible();
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByText('Elm & 4th')).toBeVisible();
    await expect(page.getByText('Maple Creek School')).toBeVisible();

    await expect(page.getByText('51.0447')).toHaveCount(0);
    await expect(page.getByText('-114.0719')).toHaveCount(0);
    await expect(page.getByText('8:15 AM')).toHaveCount(0);
    await expect(page.getByText('8.5')).toHaveCount(0);
    await expect(page.getByText(DRIVER.tripId)).toHaveCount(0);
    await expect(page.getByText(DRIVER.studentId)).toHaveCount(0);
    await expect(page.getByText('guardian@example.test')).toHaveCount(0);
    await expect(page.getByText('latitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('longitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('speed', { exact: false })).toHaveCount(0);
    await expect(page.getByText('ETA', { exact: false })).toHaveCount(0);
  });

  test('driver sees no-active-trip state when RPC returns no rows', async ({ page }) => {
    await installDriverManifestMock(page, { rows: [] });
    await page.goto('/driver/manifest');

    await expect(page.getByTestId('driver-manifest-no-active-trip')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No active trip right now.')).toBeVisible();
  });

  test('driver sees active trip context when no students are assigned', async ({ page }) => {
    await installDriverManifestMock(page, { rows: [activeTripNoStudentsRow()] });
    await page.goto('/driver/manifest');

    await expect(page.getByTestId('driver-manifest-trip-context')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByTestId('driver-manifest-no-students')).toBeVisible();
    await expect(page.getByText('No students are assigned to this active trip.')).toBeVisible();
  });

  test('raw backend error is not rendered', async ({ page }) => {
    const rawError = 'permission denied for function get_driver_active_trip_student_manifest';
    await installDriverManifestMock(page, { failRpc: true, rawError });
    await page.goto('/driver/manifest');

    await expect(page.getByTestId('driver-manifest-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Could not load student manifest right now.')).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);
  });
});
