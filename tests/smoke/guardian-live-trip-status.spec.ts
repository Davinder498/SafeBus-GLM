import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Milestone 6B - Guardian Live Trip Status UI smoke tests.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock returns a guardian
 * profile so ProtectedRoute admits the caller to /guardian/live, and returns a
 * configurable list of rows from get_guardian_live_trip_visibility.
 *
 * Coverage:
 *   1. Guardian dashboard link to Live Bus Status
 *   2. Active trip state ("Trip in progress")
 *   3. No active trip state ("No active trip right now")
 *   4. Empty state
 *   5. Generic error handling (raw backend error hidden)
 *   6. No map / GPS / ETA / UUID leakage
 *   7. Role protection (logged-out blocked)
 */

const GUARDIAN = {
  profileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  guardianId: '33333333-3333-3333-3333-333333333333',
  studentId: '44444444-4444-4444-4444-444444444444',
} as const;

const guardianProfile = {
  id: GUARDIAN.profileId,
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Guardian',
  email: 'guardian@smoke-test.local',
  role: 'guardian',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const adminProfile = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const driverProfile = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Driver',
  email: 'driver@smoke-test.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

type MockProfile = typeof guardianProfile | typeof adminProfile | typeof driverProfile;

interface GuardianLiveTripRpcRow {
  student_id: string;
  student_name: string;
  route_id: string;
  route_name: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  trip_status: string | null;
  has_active_trip: boolean;
  last_location_latitude: number | null;
  last_location_longitude: number | null;
  last_location_recorded_at: string | null;
}

function activeTripRow(): GuardianLiveTripRpcRow {
  return {
    student_id: GUARDIAN.studentId,
    student_name: 'Avery Johnson',
    route_id: '66666666-6666-6666-6666-666666666666',
    route_name: 'North Ridge Morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    trip_status: 'active',
    has_active_trip: true,
    // Coordinates are returned by the RPC but must NOT be rendered in the UI.
    last_location_latitude: 51.0447,
    last_location_longitude: -114.0719,
    last_location_recorded_at: new Date().toISOString(),
  };
}

function noActiveTripRow(): GuardianLiveTripRpcRow {
  return {
    student_id: GUARDIAN.studentId,
    student_name: 'Avery Johnson',
    route_id: '66666666-6666-6666-6666-666666666666',
    route_name: 'North Ridge Morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    trip_status: null,
    has_active_trip: false,
    last_location_latitude: null,
    last_location_longitude: null,
    last_location_recorded_at: null,
  };
}

/**
 * Install a Supabase mock for the guardian live trip page. Returns controls.
 * Must be called BEFORE page.goto.
 */
async function installGuardianLiveMock(
  page: Page,
  opts: {
    rows?: GuardianLiveTripRpcRow[];
    failRpc?: boolean;
    rawError?: string;
    profile?: MockProfile;
  } = {},
) {
  const profile = opts.profile ?? guardianProfile;
  let rowsForRpc: GuardianLiveTripRpcRow[] = opts.rows ?? [];
  let failRpc = opts.failRpc ?? false;
  const rawError =
    opts.rawError ?? 'permission denied for function get_guardian_live_trip_visibility';

  const setRows = (rows: GuardianLiveTripRpcRow[]) => {
    rowsForRpc = rows;
  };
  const setFailRpc = (fail: boolean) => {
    failRpc = fail;
  };

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    // Test-only guard: intercept any Supabase project host so local DEV .env
    // values never make smoke tests touch a real Supabase API.
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
            user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
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
            await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ message: 'no rows' }) });
            return;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0]) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      };

      if (method === 'GET' && path.includes('/profiles')) {
        await fulfillRows([profile]);
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_guardian_live_trip_visibility')) {
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
        await fulfillRows([]);
        return;
      }
      await route.fallback();
      return;
    }
    await route.fallback();
  });

  await page.addInitScript((profileForSession: MockProfile) => {
    const s = {
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
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) {
      try {
        window.localStorage.setItem(k, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    }
  }, profile);

  return { setRows, setFailRpc };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Milestone 6B - Guardian live trip status UI', () => {
  test('guardian dashboard has link to Live Bus Status', async ({ page }) => {
    await installGuardianLiveMock(page);
    await page.goto('/parent');

    await expect(page.getByRole('heading', { name: 'Live Bus Status' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'View live bus status' })).toBeVisible();
  });

  test('guardian sees active trip status for linked student', async ({ page }) => {
    await installGuardianLiveMock(page, { rows: [activeTripRow()] });
    await page.goto('/guardian/live');

    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('guardian-live-student-card')).toBeVisible();
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByText('Trip in progress')).toBeVisible();
    await expect(page.getByText('Last updated:', { exact: false })).toBeVisible();

    // No map / GPS / ETA / UUID leakage.
    await expect(page.getByText('51.0447')).toHaveCount(0);
    await expect(page.getByText('-114.0719')).toHaveCount(0);
    await expect(page.getByText('latitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('longitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('ETA', { exact: false })).toHaveCount(0);
    await expect(page.getByText('speed', { exact: false })).toHaveCount(0);
    await expect(page.getByText(GUARDIAN.studentId)).toHaveCount(0);
    await expect(page.getByText('66666666-6666-6666-6666-666666666666')).toHaveCount(0);
  });

  test('guardian sees no-active-trip state for linked student', async ({ page }) => {
    await installGuardianLiveMock(page, { rows: [noActiveTripRow()] });
    await page.goto('/guardian/live');

    await expect(page.getByTestId('guardian-live-student-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('No active trip right now')).toBeVisible();

    // "Trip in progress" should not show when there is no active trip.
    await expect(page.getByText('Trip in progress')).toHaveCount(0);
  });

  test('empty state renders when no linked student trip status is available', async ({ page }) => {
    await installGuardianLiveMock(page, { rows: [] });
    await page.goto('/guardian/live');

    await expect(page.getByTestId('guardian-live-empty')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No linked student trip status is available yet.')).toBeVisible();
  });

  test('raw backend error is safely handled', async ({ page }) => {
    const rawError = 'permission denied for function get_guardian_live_trip_visibility';
    await installGuardianLiveMock(page, { failRpc: true, rawError });
    await page.goto('/guardian/live');

    await expect(page.getByTestId('guardian-live-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('We could not load live trip status right now.')).toBeVisible();
    // Raw backend error text does NOT appear.
    await expect(page.getByText(rawError)).toHaveCount(0);
  });

  test('manual refresh button reloads status', async ({ page }) => {
    const { setRows } = await installGuardianLiveMock(page, { rows: [noActiveTripRow()] });
    await page.goto('/guardian/live');

    await expect(page.getByText('No active trip right now')).toBeVisible({ timeout: 10000 });

    // Simulate a trip starting, then refresh.
    setRows([activeTripRow()]);
    await page.getByTestId('guardian-live-refresh-button').click();

    await expect(page.getByText('Trip in progress')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Milestone 6B - Role protection', () => {
  test('logged-out user is blocked from guardian live trip page', async ({ page }) => {
    // Navigate without any mock: no session, ProtectedRoute shows "Sign in required".
    await page.goto('/guardian/live');
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('admin user is blocked from guardian live trip page', async ({ page }) => {
    await installGuardianLiveMock(page, { profile: adminProfile });
    await page.goto('/guardian/live');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toHaveCount(0);
  });

  test('driver user is blocked from guardian live trip page', async ({ page }) => {
    await installGuardianLiveMock(page, { profile: driverProfile });
    await page.goto('/guardian/live');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/driver',
    );
    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toHaveCount(0);
  });
});
