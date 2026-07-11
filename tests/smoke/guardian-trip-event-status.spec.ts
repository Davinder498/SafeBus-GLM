import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 8B - Guardian pickup/drop-off status UI smoke tests.
 *
 * Uses mocked Supabase network responses only. The browser app calls the
 * Milestone 8A RPC, and the test intercepts that call with deterministic rows.
 */

const IDS = {
  guardianProfileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  studentId: '33333333-3333-3333-3333-333333333333',
  eventId: '44444444-4444-4444-4444-444444444444',
  tripId: '55555555-5555-5555-5555-555555555555',
  driverId: '66666666-6666-6666-6666-666666666666',
  busId: '77777777-7777-7777-7777-777777777777',
  adminProfileId: '88888888-8888-8888-8888-888888888888',
  driverProfileId: '99999999-9999-9999-9999-999999999999',
} as const;

const guardianProfile = {
  id: IDS.guardianProfileId,
  tenant_id: IDS.tenantId,
  school_id: null,
  full_name: 'Test Guardian',
  email: 'guardian@smoke-test.local',
  role: 'guardian',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const adminProfile = {
  ...guardianProfile,
  id: IDS.adminProfileId,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
};

const driverProfile = {
  ...guardianProfile,
  id: IDS.driverProfileId,
  full_name: 'Test Driver',
  email: 'driver@smoke-test.local',
  role: 'driver',
};

type MockProfile = typeof guardianProfile | typeof adminProfile | typeof driverProfile;

interface GuardianTripEventRpcRow {
  student_id: string;
  student_display_name: string;
  route_name: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  student_trip_status: 'no_active_trip' | 'not_picked_up' | 'picked_up' | 'dropped_off';
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  last_event_time: string | null;
  event_id?: string;
  driver_trip_id?: string;
  driver_id?: string;
  bus_id?: string;
  tenant_id?: string;
  latitude?: number;
  longitude?: number;
  speed_mps?: number;
  eta?: string;
  qr_payload?: string;
  driver_phone?: string;
  guardian_email?: string;
  home_address?: string;
  medical_notes?: string;
}

function eventRow(
  status: GuardianTripEventRpcRow['student_trip_status'],
  overrides: Partial<GuardianTripEventRpcRow> = {},
): GuardianTripEventRpcRow {
  return {
    student_id: IDS.studentId,
    student_display_name: 'Avery Johnson',
    route_name: 'North Ridge Morning',
    trip_status: status === 'no_active_trip' ? null : 'active',
    trip_direction: status === 'no_active_trip' ? null : 'morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    student_trip_status: status,
    pickup_event_time:
      status === 'picked_up' || status === 'dropped_off'
        ? '2025-01-01T14:05:00.000Z'
        : null,
    dropoff_event_time:
      status === 'dropped_off' ? '2025-01-01T22:15:00.000Z' : null,
    last_event_time:
      status === 'dropped_off'
        ? '2025-01-01T22:15:00.000Z'
        : status === 'picked_up'
          ? '2025-01-01T14:05:00.000Z'
          : null,
    event_id: IDS.eventId,
    driver_trip_id: IDS.tripId,
    driver_id: IDS.driverId,
    bus_id: IDS.busId,
    tenant_id: IDS.tenantId,
    latitude: 51.0447,
    longitude: -114.0719,
    speed_mps: 8.5,
    eta: '8 minutes',
    qr_payload: 'qr-secret-payload',
    driver_phone: '555-0101',
    guardian_email: 'guardian-private@example.test',
    home_address: '123 Private Home Street',
    medical_notes: 'Private medical note',
    ...overrides,
  };
}

async function installGuardianEventsMock(
  page: Page,
  opts: {
    rows?: GuardianTripEventRpcRow[];
    failRpc?: boolean;
    rawError?: string;
    profile?: MockProfile;
  } = {},
) {
  const profile = opts.profile ?? guardianProfile;
  let rowsForRpc = opts.rows ?? [];
  let failRpc = opts.failRpc ?? false;
  let rpcCallCount = 0;
  const rawError =
    opts.rawError ??
    'permission denied for function get_guardian_student_trip_event_visibility';

  const setRows = (rows: GuardianTripEventRpcRow[]) => {
    rowsForRpc = rows;
  };
  const getRpcCallCount = () => rpcCallCount;

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
      if (path.endsWith('/token')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'x',
            refresh_token: 'x',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: profile.id,
              email: profile.email,
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

      if (method === 'GET' && path.includes('/profiles')) {
        await fulfillRows([profile]);
        return;
      }
      if (
        method === 'POST' &&
        path.includes('/rpc/get_guardian_student_trip_event_visibility')
      ) {
        rpcCallCount += 1;
        if (failRpc) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: rawError }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(rowsForRpc),
          });
        }
        return;
      }
      if (method === 'GET') {
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }
      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  await page.addInitScript((profileForSession: MockProfile) => {
    const session = {
      access_token: 'x',
      refresh_token: 'x',
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

  return { setRows, getRpcCallCount };
}

test.describe('Milestone 8B - Guardian pickup/drop-off status UI', () => {
  test('guardian dashboard links to pickup and drop-off status', async ({ page }) => {
    await installGuardianEventsMock(page);
    await page.goto('/parent');

    await expect(page.getByRole('heading', { name: 'Pickup & Drop-off Status' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'View pickup status' })).toHaveAttribute(
      'href',
      '/guardian/events',
    );
  });

  test('guardian user can access the events page', async ({ page }) => {
    await installGuardianEventsMock(page, { rows: [eventRow('not_picked_up')] });
    await page.goto('/guardian/events');

    await expect(
      page.getByRole('heading', { name: 'Pickup & Drop-off Status', level: 1 }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-events-student-card')).toBeVisible();
  });

  test('renders not picked up, picked up, dropped off, and no active trip states', async ({
    page,
  }) => {
    await installGuardianEventsMock(page, {
      rows: [
        eventRow('not_picked_up', {
          student_id: `${IDS.studentId.slice(0, -1)}1`,
          student_display_name: 'Avery Johnson',
        }),
        eventRow('picked_up', {
          student_id: `${IDS.studentId.slice(0, -1)}2`,
          student_display_name: 'Blair Singh',
        }),
        eventRow('dropped_off', {
          student_id: `${IDS.studentId.slice(0, -1)}3`,
          student_display_name: 'Casey Chen',
        }),
        eventRow('no_active_trip', {
          student_id: `${IDS.studentId.slice(0, -1)}4`,
          student_display_name: 'Devon Lee',
        }),
      ],
    });
    await page.goto('/guardian/events');

    await expect(page.getByText('Avery Johnson')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Not picked up')).toBeVisible();
    await expect(page.getByText('Blair Singh')).toBeVisible();
    await expect(page.getByText('Picked up', { exact: true })).toBeVisible();
    await expect(page.getByText('Casey Chen')).toBeVisible();
    await expect(page.getByText('Dropped off')).toBeVisible();
    await expect(page.getByText('Devon Lee')).toBeVisible();
    await expect(page.getByText('No active trip right now', { exact: true })).toBeVisible();
    await expect(page.getByText('Pickup stop:').first()).toBeVisible();
    await expect(page.getByText('Drop-off stop:').first()).toBeVisible();
    await expect(page.getByText('Pickup time:').first()).toBeVisible();
    await expect(page.getByText('Drop-off time:')).toBeVisible();
    await expect(page.getByText('Last updated:').first()).toBeVisible();
  });

  test('empty state renders when no student trip status is available', async ({ page }) => {
    await installGuardianEventsMock(page, { rows: [] });
    await page.goto('/guardian/events');

    await expect(page.getByTestId('guardian-events-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No student trip status is available yet.')).toBeVisible();
  });

  test('raw backend error is safely handled', async ({ page }) => {
    const rawError = 'permission denied for function get_guardian_student_trip_event_visibility';
    await installGuardianEventsMock(page, { failRpc: true, rawError });
    await page.goto('/guardian/events');

    await expect(page.getByTestId('guardian-events-error')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('We could not load student trip status right now.'),
    ).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);
  });

  test('manual refresh calls the RPC again and updates status', async ({ page }) => {
    const controls = await installGuardianEventsMock(page, {
      rows: [eventRow('not_picked_up')],
    });
    await page.goto('/guardian/events');

    await expect(page.getByText('Not picked up')).toBeVisible({ timeout: 10000 });
    const beforeRefresh = controls.getRpcCallCount();
    controls.setRows([eventRow('picked_up')]);
    await page.getByTestId('guardian-events-refresh-button').click();

    await expect(page.getByText('Picked up')).toBeVisible({ timeout: 10000 });
    expect(controls.getRpcCallCount()).toBeGreaterThan(beforeRefresh);
  });

  test('sensitive mocked values are not rendered', async ({ page }) => {
    await installGuardianEventsMock(page, { rows: [eventRow('dropped_off')] });
    await page.goto('/guardian/events');

    await expect(page.getByTestId('guardian-events-student-card')).toBeVisible({
      timeout: 10000,
    });
    for (const forbidden of [
      IDS.eventId,
      IDS.tripId,
      IDS.driverId,
      IDS.busId,
      IDS.tenantId,
      '51.0447',
      '-114.0719',
      '8.5',
      '8 minutes',
      'qr-secret-payload',
      '555-0101',
      'guardian-private@example.test',
      '123 Private Home Street',
      'Private medical note',
      'Unrelated Student',
    ]) {
      await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
    }
  });
});

test.describe('Milestone 8B - Role protection', () => {
  test('logged-out user is blocked from guardian events page', async ({ page }) => {
    await page.goto('/guardian/events');

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('admin user is blocked from guardian events page', async ({ page }) => {
    await installGuardianEventsMock(page, { profile: adminProfile });
    await page.goto('/guardian/events');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(
      page.getByRole('heading', { name: 'Pickup & Drop-off Status', level: 1 }),
    ).toHaveCount(0);
  });

  test('driver user is blocked from guardian events page', async ({ page }) => {
    await installGuardianEventsMock(page, { profile: driverProfile });
    await page.goto('/guardian/events');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/driver',
    );
    await expect(
      page.getByRole('heading', { name: 'Pickup & Drop-off Status', level: 1 }),
    ).toHaveCount(0);
  });
});
