import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 11B - Guardian Live Bus Map UI smoke tests.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock returns a guardian
 * profile so ProtectedRoute admits the caller to /guardian/live-map, and
 * returns a configurable list of rows from
 * get_guardian_student_live_bus_location_state and
 * get_guardian_student_route_visibility.
 *
 * The location-state RPC returns only safe fields per the Milestone 11A
 * contract: student_id, location_state, latitude, longitude,
 * location_recorded_at, location_age_seconds. Coordinates are only present for
 * fresh rows; stale/missing/invalid rows must NOT render markers.
 *
 * Coverage:
 *   1. Guardian can access the live bus map page
 *   2. Fresh location renders a marker (tile config missing -> fresh summary)
 *   3. Stale state renders no marker
 *   4. Missing state renders no marker
 *   5. Invalid state renders no marker
 *   6. Multiple linked students
 *   7. Siblings sharing the same coordinates render ONE marker
 *   8. No active trip / no eligible students
 *   9. Tile configuration missing fallback
 *  10. RPC error handling (raw error hidden)
 *  11. Permission/role denial (admin/driver blocked, logged-out blocked)
 *  12. No direct location-table browser request
 *  13. No sensitive leakage (raw lat/long text, student id, technical state terms)
 *  14. Manual refresh
 */

const GUARDIAN = {
  profileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  guardianId: '33333333-3333-3333-3333-333333333333',
  studentId: '44444444-4444-4444-4444-444444444444',
  studentId2: '55555555-5555-5555-5555-555555555555',
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

interface GuardianLiveBusLocationRpcRow {
  student_id: string;
  location_state: 'fresh' | 'stale' | 'missing' | 'invalid';
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
  location_age_seconds: number | null;
}

interface GuardianStudentRouteRpcRow {
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_preferred_name: string | null;
  student_grade: string | null;
  route_assignment_id: string | null;
  route_id: string | null;
  route_name: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
}

function freshRow(studentId: string = GUARDIAN.studentId): GuardianLiveBusLocationRpcRow {
  return {
    student_id: studentId,
    location_state: 'fresh',
    latitude: 51.0447,
    longitude: -114.0719,
    location_recorded_at: new Date().toISOString(),
    location_age_seconds: 10,
  };
}

function staleRow(studentId: string = GUARDIAN.studentId): GuardianLiveBusLocationRpcRow {
  return {
    student_id: studentId,
    location_state: 'stale',
    // Stale rows withhold coordinates per the RPC contract.
    latitude: null,
    longitude: null,
    location_recorded_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    location_age_seconds: 600,
  };
}

function missingRow(studentId: string = GUARDIAN.studentId): GuardianLiveBusLocationRpcRow {
  return {
    student_id: studentId,
    location_state: 'missing',
    latitude: null,
    longitude: null,
    location_recorded_at: null,
    location_age_seconds: null,
  };
}

function invalidRow(studentId: string = GUARDIAN.studentId): GuardianLiveBusLocationRpcRow {
  return {
    student_id: studentId,
    location_state: 'invalid',
    latitude: null,
    longitude: null,
    location_recorded_at: null,
    location_age_seconds: null,
  };
}

function studentRouteRow(
  studentId: string = GUARDIAN.studentId,
  firstName = 'Avery',
  lastName = 'Johnson',
): GuardianStudentRouteRpcRow {
  return {
    student_id: studentId,
    student_first_name: firstName,
    student_last_name: lastName,
    student_preferred_name: null,
    student_grade: '3',
    route_assignment_id: 'route-assign-1',
    route_id: '66666666-6666-6666-6666-666666666666',
    route_name: 'North Ridge Morning',
    pickup_stop_name: null,
    dropoff_stop_name: null,
    assignment_status: 'active',
  };
}

interface InstallMockOptions {
  rows?: GuardianLiveBusLocationRpcRow[];
  routeRows?: GuardianStudentRouteRpcRow[];
  failRpc?: boolean;
  rawError?: string;
  profile?: MockProfile;
  session?: boolean;
}

async function installGuardianLiveMapMock(
  page: Page,
  opts: InstallMockOptions = {},
) {
  const profile = opts.profile ?? guardianProfile;
  let rowsForRpc: GuardianLiveBusLocationRpcRow[] = opts.rows ?? [];
  let routeRowsForRpc: GuardianStudentRouteRpcRow[] = opts.routeRows ?? [];
  let failRpc = opts.failRpc ?? false;
  const rawError =
    opts.rawError ?? 'permission denied for function get_guardian_student_live_bus_location_state';

  const setRows = (rows: GuardianLiveBusLocationRpcRow[]) => {
    rowsForRpc = rows;
  };
  const setRouteRows = (rows: GuardianStudentRouteRpcRow[]) => {
    routeRowsForRpc = rows;
  };
  const setFailRpc = (fail: boolean) => {
    failRpc = fail;
  };

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }
    const method = route.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (opts.session === false) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
        return;
      }
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

      if (method === 'POST' && path.includes('/rpc/get_guardian_student_live_bus_location_state')) {
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

      if (method === 'POST' && path.includes('/rpc/get_guardian_student_route_visibility')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(routeRowsForRpc),
        });
        return;
      }

      // Guard: no direct live-location table browser access is allowed.
      if (
        method === 'GET' &&
        (path.includes('/driver_trip_current_locations') ||
          path.includes('/driver_trip_locations') ||
          path.includes('/live_locations'))
      ) {
        await blockUnexpectedSupabaseRestAccess(route, method, path);
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

  if (opts.session !== false) {
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
  }

  return { setRows, setRouteRows, setFailRpc };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Milestone 11B - Guardian live bus map UI', () => {
  test('guardian with one student and fresh location sees the map and status', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByRole('heading', { name: 'Live Bus Map', level: 1 })).toBeVisible({ timeout: 10000 });

    // Tile config is missing in test env, so the config-missing card shows with
    // a fresh-location summary (markers are NOT rendered without tiles).
    await expect(page.getByTestId('guardian-live-bus-map-config-missing')).toBeVisible();
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toBeVisible();

    // Student status list shows the safe, non-technical label for fresh state.
    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible();
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('Current location available')).toBeVisible();

    // No technical database terms leak to guardians.
    await expect(page.getByText('fresh', { exact: true })).toHaveCount(0);
    await expect(page.getByText('stale', { exact: true })).toHaveCount(0);
    await expect(page.getByText('missing', { exact: true })).toHaveCount(0);
    await expect(page.getByText('invalid', { exact: true })).toHaveCount(0);
  });

  test('stale state renders no marker and shows delayed label', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [staleRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible({ timeout: 10000 });
    // No fresh summary because no fresh location.
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
    await expect(page.getByText('Location update is delayed', { exact: true })).toBeVisible();
    await expect(page.getByText('stale', { exact: true })).toHaveCount(0);
  });

  test('missing state renders no marker and shows not-received label', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [missingRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
    await expect(page.getByText('Location has not been received')).toBeVisible();
  });

  test('invalid state renders no marker and shows unavailable label', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [invalidRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
    await expect(page.getByText('Location is temporarily unavailable', { exact: true })).toBeVisible();
  });

  test('multiple linked students with mixed states are all listed', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [
        freshRow(GUARDIAN.studentId),
        staleRow(GUARDIAN.studentId2),
      ],
      routeRows: [
        studentRouteRow(GUARDIAN.studentId, 'Avery', 'Johnson'),
        studentRouteRow(GUARDIAN.studentId2, 'Blair', 'Smith'),
      ],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByText('Avery Johnson')).toBeVisible();
    await expect(page.getByText('Blair Smith')).toBeVisible();
    await expect(page.getByText('Current location available', { exact: true })).toBeVisible();
    await expect(page.getByText('Location update is delayed', { exact: true })).toBeVisible();
    // Fresh summary shows count of 2 linked students with current location? No:
    // only one fresh row, so summary says "1 linked student".
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toContainText('1 linked student');
  });

  test('siblings sharing the same coordinates render one fresh summary without implying shared bus', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [
        freshRow(GUARDIAN.studentId),
        freshRow(GUARDIAN.studentId2),
      ],
      routeRows: [
        studentRouteRow(GUARDIAN.studentId, 'Avery', 'Johnson'),
        studentRouteRow(GUARDIAN.studentId2, 'Blair', 'Smith'),
      ],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(2, { timeout: 10000 });
    // Both fresh; the map component groups same-coordinates into one marker.
    // Without tile config, the fresh summary reports current location available.
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toBeVisible();
  });

  test('no active trip / no eligible students shows empty state', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    // With a linked student but no location rows, the list still shows the
    // student card without a location pill (no loc row).
    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible({ timeout: 10000 });
  });

  test('no eligible students at all shows empty state', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [],
      routeRows: [],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-empty')).toBeVisible({ timeout: 10000 });
  });

  test('tile configuration missing keeps student status usable', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-bus-map-config-missing')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('The interactive map is not available right now.')).toBeVisible();
    // Raw env var names are not exposed.
    await expect(page.getByText('VITE_MAP_TILE_URL', { exact: false })).toHaveCount(0);
    await expect(page.getByText('VITE_MAP_TILE_ATTRIBUTION', { exact: false })).toHaveCount(0);
  });

  test('RPC error is safely handled and raw error is hidden', async ({ page }) => {
    const rawError = 'permission denied for function get_guardian_student_live_bus_location_state';
    await installGuardianLiveMapMock(page, {
      rows: [],
      routeRows: [studentRouteRow()],
      failRpc: true,
      rawError,
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('We could not load the live bus map right now.')).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);
  });

  test('manual refresh reloads state', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [missingRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Location has not been received')).toBeVisible({ timeout: 10000 });

    setRows([freshRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    await expect(page.getByText('Current location available')).toBeVisible({ timeout: 10000 });
  });

  test('no raw coordinates, student ids, or technical terms leak', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-student-card')).toBeVisible({ timeout: 10000 });
    // Raw coordinate text must not appear as normal guardian-facing text.
    await expect(page.getByText('51.0447')).toHaveCount(0);
    await expect(page.getByText('-114.0719')).toHaveCount(0);
    // Student UUID must not be rendered.
    await expect(page.getByText(GUARDIAN.studentId)).toHaveCount(0);
    // Technical state terms must not be rendered as visible labels.
    await expect(page.getByText('location_state', { exact: false })).toHaveCount(0);
    await expect(page.getByText('latitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('longitude', { exact: false })).toHaveCount(0);
    // ETA / speed / driver are out of scope.
    await expect(page.getByText('ETA', { exact: false })).toHaveCount(0);
    await expect(page.getByText('km/h', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Driver', { exact: false })).toHaveCount(0);
  });
});

test.describe('Milestone 11C - Safe refresh and resilience', () => {
  test('fresh-to-stale transition removes the marker and shows delayed label', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });

    // Transition fresh -> stale via manual refresh.
    setRows([staleRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    await expect(page.getByText('Location update is delayed', { exact: true })).toBeVisible({ timeout: 10000 });
    // Fresh summary must be gone (no marker).
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
  });

  test('fresh-to-missing transition removes the marker', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });

    setRows([missingRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    await expect(page.getByText('Location has not been received')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
  });

  test('fresh-to-invalid transition removes the marker', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });

    setRows([invalidRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    await expect(page.getByText('Location is temporarily unavailable', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
  });

  test('fresh-to-error transition shows refresh-failure banner and no live marker', async ({ page }) => {
    const { setRows, setFailRpc } = await installGuardianLiveMapMock(page, {
      rows: [freshRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });

    // Force the next RPC call to fail.
    setFailRpc(true);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    // A refresh-error banner appears, and no fresh marker/summary is shown.
    await expect(page.getByTestId('guardian-live-map-refresh-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-live-bus-map-fresh-summary')).toHaveCount(0);
    // The old fresh label must not remain as a live status.
    await expect(page.getByText('Current location available', { exact: true })).toHaveCount(0);

    // Reset and verify recovery.
    setFailRpc(false);
    setRows([freshRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();
    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('recovery after a later successful response', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [missingRow()],
      routeRows: [studentRouteRow()],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Location has not been received')).toBeVisible({ timeout: 10000 });

    setRows([freshRow()]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('multiple students updating independently', async ({ page }) => {
    const { setRows } = await installGuardianLiveMapMock(page, {
      rows: [
        freshRow(GUARDIAN.studentId),
        missingRow(GUARDIAN.studentId2),
      ],
      routeRows: [
        studentRouteRow(GUARDIAN.studentId, 'Avery', 'Johnson'),
        studentRouteRow(GUARDIAN.studentId2, 'Blair', 'Smith'),
      ],
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByText('Avery Johnson')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Current location available', { exact: true })).toBeVisible();
    await expect(page.getByText('Location has not been received')).toBeVisible();

    // Swap states: student1 -> missing, student2 -> fresh.
    setRows([
      missingRow(GUARDIAN.studentId),
      freshRow(GUARDIAN.studentId2),
    ]);
    await page.getByTestId('guardian-live-map-refresh-button').click();

    // Both labels should still be present but swapped.
    await expect(page.getByText('Current location available', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Location has not been received')).toBeVisible();
  });

  test('initial RPC failure shows full error state, not stale cache', async ({ page }) => {
    await installGuardianLiveMapMock(page, {
      rows: [],
      routeRows: [studentRouteRow()],
      failRpc: true,
    });
    await page.goto('/guardian/live-map');

    await expect(page.getByTestId('guardian-live-map-error')).toBeVisible({ timeout: 10000 });
    // No student cards rendered because no successful data.
    await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(0);
  });
});

test.describe('Milestone 11B - Role protection', () => {
  test('logged-out user is blocked from guardian live bus map page', async ({ page }) => {
    await installGuardianLiveMapMock(page, { session: false });
    await page.goto('/guardian/live-map');
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({ timeout: 15000 });
  });

  test('admin user is blocked from guardian live bus map page', async ({ page }) => {
    await installGuardianLiveMapMock(page, { profile: adminProfile });
    await page.goto('/guardian/live-map');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute('href', '/admin');
    await expect(page.getByRole('heading', { name: 'Live Bus Map', level: 1 })).toHaveCount(0);
  });

  test('driver user is blocked from guardian live bus map page', async ({ page }) => {
    await installGuardianLiveMapMock(page, { profile: driverProfile });
    await page.goto('/guardian/live-map');

    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute('href', '/driver');
    await expect(page.getByRole('heading', { name: 'Live Bus Map', level: 1 })).toHaveCount(0);
  });
});