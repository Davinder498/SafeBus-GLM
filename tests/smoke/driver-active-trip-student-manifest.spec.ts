import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

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
  trip_name: string | null;
  bus_number: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  student_trip_status: 'not_picked_up' | 'picked_up' | 'dropped_off' | null;
  latitude?: number;
  longitude?: number;
  speed_mps?: number;
  eta?: string;
  guardian_email?: string;
  home_address?: string;
  medical_notes?: string;
}

function manifestRow(): DriverManifestRpcRow {
  return {
    active_trip_id: DRIVER.tripId,
    student_id: DRIVER.studentId,
    student_display_name: 'Avery Johnson',
    route_name: 'North Ridge Morning',
    trip_name: 'North Ridge Outbound',
    bus_number: '12',
    trip_status: 'active',
    trip_direction: 'morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    assignment_status: 'active',
    pickup_event_time: null,
    dropoff_event_time: null,
    student_trip_status: 'not_picked_up',
    latitude: 51.0447,
    longitude: -114.0719,
    speed_mps: 8.5,
    eta: '8:15 AM',
    guardian_email: 'guardian@example.test',
    home_address: '123 Private Home Road',
    medical_notes: 'Sensitive medical note',
  };
}

function activeTripNoStudentsRow(): DriverManifestRpcRow {
  return {
    active_trip_id: DRIVER.tripId,
    student_id: null,
    student_display_name: null,
    route_name: 'North Ridge Morning',
    trip_name: 'North Ridge Outbound',
    bus_number: '12',
    trip_status: 'active',
    trip_direction: 'morning',
    pickup_stop_name: null,
    dropoff_stop_name: null,
    assignment_status: null,
    pickup_event_time: null,
    dropoff_event_time: null,
    student_trip_status: null,
  };
}

interface DriverManifestMockControl {
  eventRpcCalls: string[];
  directEventTableWrites: string[];
}

async function installDriverManifestMock(
  page: Page,
  opts: {
    profile?: MockProfile;
    rows?: DriverManifestRpcRow[];
    failRpc?: boolean;
    failActionRpc?: boolean;
    rawError?: string;
    rawActionError?: string;
  } = {},
): Promise<DriverManifestMockControl> {
  const profile = opts.profile ?? driverProfile;
  let rows = opts.rows ?? [];
  const rawError =
    opts.rawError ?? 'permission denied for function get_driver_active_trip_student_manifest';
  const rawActionError =
    opts.rawActionError ?? 'duplicate key value violates unique constraint';
  const eventRpcCalls: string[] = [];
  const directEventTableWrites: string[] = [];

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

      if (method === 'POST' && path.includes('/rpc/mark_student_picked_up_for_active_trip')) {
        eventRpcCalls.push('mark_student_picked_up_for_active_trip');
        if (opts.failActionRpc) {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ message: rawActionError }),
          });
          return;
        }
        rows = rows.map((row) =>
          row.student_id
            ? {
                ...row,
                pickup_event_time: '2025-01-01T12:10:00.000Z',
                student_trip_status: 'picked_up',
              }
            : row,
        );
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return;
      }

      if (method === 'POST' && path.includes('/rpc/mark_student_dropped_off_for_active_trip')) {
        eventRpcCalls.push('mark_student_dropped_off_for_active_trip');
        if (opts.failActionRpc) {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ message: rawActionError }),
          });
          return;
        }
        rows = rows.map((row) =>
          row.student_id
            ? {
                ...row,
                dropoff_event_time: '2025-01-01T12:25:00.000Z',
                student_trip_status: 'dropped_off',
              }
            : row,
        );
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return;
      }

      if (
        path.includes('/student_trip_events')
        && ['POST', 'PATCH', 'PUT'].includes(method)
      ) {
        directEventTableWrites.push(`${method} ${path}`);
        await route.fulfill({
          status: 405,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'direct event table writes are not allowed' }),
        });
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
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

  return { eventRpcCalls, directEventTableWrites };
}

test.describe('Milestone 7B - Driver student trip event recording', () => {
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
    await expect(page.getByRole('heading', { name: 'Pickup & drop-off', level: 1 })).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Pickup & drop-off', level: 1 })).toHaveCount(0);
  });

  test('driver can access manifest and see safe assigned student content', async ({ page }) => {
    await installDriverManifestMock(page, { rows: [manifestRow()] });
    await page.goto('/driver/manifest');

    await expect(page.getByRole('heading', { name: 'Pickup & drop-off', level: 1 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('driver-manifest-student-card')).toBeVisible();
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByText('Elm & 4th')).toBeVisible();
    await expect(page.getByText('Maple Creek School')).toBeVisible();
    await expect(page.getByText('Not picked up')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Mark picked up' })).toBeVisible();

    await expect(page.getByText('51.0447')).toHaveCount(0);
    await expect(page.getByText('-114.0719')).toHaveCount(0);
    await expect(page.getByText('8:15 AM')).toHaveCount(0);
    await expect(page.getByText('8.5')).toHaveCount(0);
    await expect(page.getByText(DRIVER.tripId)).toHaveCount(0);
    await expect(page.getByText(DRIVER.studentId)).toHaveCount(0);
    await expect(page.getByText('guardian@example.test')).toHaveCount(0);
    await expect(page.getByText('123 Private Home Road')).toHaveCount(0);
    await expect(page.getByText('Sensitive medical note')).toHaveCount(0);
    await expect(page.getByText('latitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('longitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('speed', { exact: false })).toHaveCount(0);
    await expect(page.getByText('ETA', { exact: false })).toHaveCount(0);
    await expect(page.getByText('home address', { exact: false })).toHaveCount(0);
    await expect(page.getByText('medical', { exact: false })).toHaveCount(0);
  });

  test('driver can mark picked up and dropped off through RPC flow', async ({ page }) => {
    const control = await installDriverManifestMock(page, { rows: [manifestRow()] });
    await page.goto('/driver/manifest');

    await page.getByRole('button', { name: 'Mark picked up' }).click();
    await expect(page.getByText('Pickup and drop-off status updated.')).toBeVisible();
    await expect(page.getByText('Picked up')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Mark dropped off' })).toBeVisible();

    await page.getByRole('button', { name: 'Mark dropped off' }).click();
    await expect(page.getByText('Dropped off')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Mark picked up' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark dropped off' })).toHaveCount(0);

    expect(control.eventRpcCalls).toEqual([
      'mark_student_picked_up_for_active_trip',
      'mark_student_dropped_off_for_active_trip',
    ]);
    expect(control.directEventTableWrites).toEqual([]);
  });

  test('driver sees safe message when event action fails', async ({ page }) => {
    const rawActionError = 'duplicate key value violates unique constraint';
    await installDriverManifestMock(page, {
      rows: [manifestRow()],
      failActionRpc: true,
      rawActionError,
    });
    await page.goto('/driver/manifest');

    await page.getByRole('button', { name: 'Mark picked up' }).click();

    await expect(page.getByText('Could not update student status. Please try again.')).toBeVisible();
    await expect(page.getByText(rawActionError)).toHaveCount(0);
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
    await expect(page.getByText('Could not load pickup and drop-off right now.')).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);
  });
});
