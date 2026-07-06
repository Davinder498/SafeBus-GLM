import { type Page, type Route } from '@playwright/test';

/**
 * Safe, mocked Supabase layer for Playwright smoke tests.
 *
 * - NO production Supabase credentials are used. The app runs with the
 *   gitignored placeholder `.env` (https://placeholder.supabase.co).
 * - NO test backdoors are added to the production app. All mocking happens
 *   inside the test runner via `page.route` network interception.
 * - All Supabase REST (`/rest/v1/`) and Auth (`/auth/v1/`) requests are
 *   intercepted and answered with deterministic mock data, so no request
 *   ever leaves the browser.
 *
 * The fixture exposes helpers to drive the driver-dashboard state machine:
 *   - installSupabaseMock(page, {withActiveTrip}) -> intercepts all Supabase
 *     traffic and returns a { setActiveTrip } control.
 */

export const MOCK = {
  driverId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  profileId: '33333333-3333-3333-3333-333333333333',
  busId: '44444444-4444-4444-4444-444444444444',
  routeId: '55555555-5555-5555-5555-555555555555',
  tripId: '66666666-6666-6666-6666-666666666666',
  assignmentId: '77777777-7777-7777-7777-777777777777',
  authToken: 'mock-access-token-for-smoke-test-only',
} as const;

const driverProfile = {
  id: MOCK.profileId,
  tenant_id: MOCK.tenantId,
  school_id: null,
  full_name: 'Test Driver',
  email: 'driver@smoke-test.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const driverRow = {
  id: MOCK.driverId,
  tenant_id: MOCK.tenantId,
  profile_id: MOCK.profileId,
  employee_number: 'DRV-001',
  phone: null,
  status: 'active',
};

const busRow = {
  id: MOCK.busId,
  bus_number: '12',
  license_plate: 'SB-12',
  capacity: 48,
  status: 'active',
};

const routeRow = {
  id: MOCK.routeId,
  route_name: 'North Ridge Morning',
  route_code: 'NR-AM',
  route_type: 'morning',
  status: 'active',
};

function activeTripRow() {
  return {
    id: MOCK.tripId,
    tenant_id: MOCK.tenantId,
    driver_id: MOCK.driverId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    trip_type: 'morning',
    status: 'active',
    service_date: '2025-01-01',
    started_at: '2025-01-01T12:00:00.000Z',
    ended_at: null,
    created_at: '2025-01-01T12:00:00.000Z',
    updated_at: '2025-01-01T12:00:00.000Z',
  };
}

function completedTripRow() {
  return {
    ...activeTripRow(),
    status: 'completed',
    ended_at: '2025-01-01T12:30:00.000Z',
  };
}

/** Latest-location row returned by the update_driver_trip_location RPC and by
 * GETs on driver_trip_current_locations. */
function currentLocationRow() {
  return {
    driver_trip_id: MOCK.tripId,
    tenant_id: MOCK.tenantId,
    driver_id: MOCK.driverId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    latitude: 51.0447,
    longitude: -114.0719,
    accuracy_m: 15,
    heading_deg: 90,
    speed_mps: 8.5,
    source: 'browser',
    recorded_at: '2025-01-01T12:05:00.000Z',
    updated_at: '2025-01-01T12:05:00.000Z',
  };
}

/** Mock driver route assignment row (4F). */
function assignmentRow() {
  return {
    id: MOCK.assignmentId,
    tenant_id: MOCK.tenantId,
    driver_id: MOCK.driverId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    trip_type: 'morning',
    status: 'active',
    effective_from: null,
    effective_to: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
}

/** Decode the PostgREST table from a `/rest/v1/<table>?<query>` URL. */
function tableFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  // parts: ['rest','v1','<table>'] or ['rest','v1','rpc','<name>']
  if (parts.length >= 4 && parts[2] === 'rpc') {
    return `rpc/${parts[3]}`;
  }
  return parts[2] ?? '';
}

export interface MockControl {
  setActiveTrip: (trip: ReturnType<typeof activeTripRow> | null) => void;
  setAssignments: (assignments: ReturnType<typeof assignmentRow>[] | null) => void;
}

export interface MockSupabaseOptions {
  withActiveTrip?: boolean;
  withAssignments?: boolean;
}

/**
 * Install Supabase mocking on the page. Must be called BEFORE page.goto.
 * Intercepts every request to the placeholder Supabase host and answers with
 * deterministic mock data. No request reaches the network.
 */
export async function installSupabaseMock(
  page: Page,
  opts: MockSupabaseOptions = {},
): Promise<MockControl> {
  let currentActiveTrip: ReturnType<typeof activeTripRow> | null = opts.withActiveTrip
    ? activeTripRow()
    : null;
  let currentAssignments: ReturnType<typeof assignmentRow>[] | null = opts.withAssignments
    ? [assignmentRow()]
    : null;

  const setActiveTrip = (trip: ReturnType<typeof activeTripRow> | null) => {
    currentActiveTrip = trip;
  };
  const setAssignments = (assignments: ReturnType<typeof assignmentRow>[] | null) => {
    currentAssignments = assignments;
  };

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());

    // Only intercept requests to the placeholder Supabase host. Everything
    // else (app assets, HMR) is allowed through normally.
    if (!url.hostname.includes('placeholder.supabase.co')) {
      await route.fallback();
      return;
    }

    const method = route.request().method();
    const path = url.pathname;
    const table = tableFromPath(path);

    // --- Supabase Auth ---
    if (path.startsWith('/auth/v1/')) {
      // supabase-js calls /auth/v1/user with the bearer token to refresh.
      if (path.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: MOCK.profileId,
            aud: 'authenticated',
            role: 'authenticated',
            email: driverProfile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: driverProfile.created_at,
          }),
        });
        return;
      }
      // token grant / refresh
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: MOCK.authToken,
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: MOCK.profileId,
              email: driverProfile.email,
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
      // Detect whether the client used .single() / .maybeSingle(), which sets
      // Accept: application/vnd.pgrst.object+json. In that case PostgREST
      // returns a single JSON object (or 406 for zero rows); we return a
      // single object for one row and an empty 406-ish response for zero rows.
      const acceptHeader = route.request().headers()['accept'] ?? '';
      const wantsSingle = acceptHeader.includes('application/vnd.pgrst.object+json');

      const fulfillRows = async (rows: Record<string, unknown>[]) => {
        if (wantsSingle) {
          if (rows.length === 0) {
            // .maybeSingle() tolerates zero rows; .single() errors. Return a
            // 406 with empty body to mimic PostgREST, which supabase-js turns
            // into { data: null, error: null } for maybeSingle.
            await route.fulfill({
              status: 406,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned' }),
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

      // GET selects
      if (method === 'GET') {
        if (table === 'profiles') {
          await fulfillRows([driverProfile]);
          return;
        }
        if (table === 'drivers') {
          await fulfillRows([driverRow]);
          return;
        }
        if (table === 'buses') {
          await fulfillRows([busRow]);
          return;
        }
        if (table === 'routes') {
          await fulfillRows([routeRow]);
          return;
        }
        if (table === 'driver_trips') {
          // Active-trip query returns the current active trip or empty.
          await fulfillRows(currentActiveTrip ? [currentActiveTrip] : []);
          return;
        }
        if (table === 'driver_trip_current_locations') {
          // Only return a current-location row when there is an active trip.
          await fulfillRows(currentActiveTrip ? [currentLocationRow()] : []);
          return;
        }
        if (table === 'driver_route_assignments') {
          // Return the current assignments (or empty if null).
          await fulfillRows(currentAssignments ?? []);
          return;
        }
        await fulfillRows([]);
        return;
      }

      // POST (insert a new trip, or call an RPC)
      if (method === 'POST') {
        if (table === 'rpc/end_driver_trip') {
          const completed = completedTripRow();
          currentActiveTrip = null;
          // RPCs return a single object.
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completed),
          });
          return;
        }
        if (table === 'rpc/start_driver_trip_from_assignment') {
          // Start a trip from an assignment — return a new active trip.
          const newTrip = activeTripRow();
          currentActiveTrip = newTrip;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(newTrip),
          });
          return;
        }
        if (table === 'rpc/update_driver_trip_location') {
          // Acknowledge the location update with the current-location row.
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(currentLocationRow()),
          });
          return;
        }
        if (table === 'driver_trips') {
          const newTrip = activeTripRow();
          currentActiveTrip = newTrip;
          // Insert with .select().single() returns a single object.
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(newTrip),
          });
          return;
        }
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
        return;
      }

      // PATCH/PUT — the app must never use these for driver_trips now that
      // end is an RPC. Respond with 405 to surface any accidental update path.
      if (method === 'PATCH' || method === 'PUT') {
        await route.fulfill({
          status: 405,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'method not allowed' }),
        });
        return;
      }

      await route.fallback();
      return;
    }

    await route.fallback();
  });

  // Pre-seed localStorage with a fake session so supabase-js getSession()
  // returns synchronously without a network round-trip on first paint.
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'mock-access-token-for-smoke-test-only',
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'driver@smoke-test.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2025-01-01T00:00:00.000Z',
      },
    };
    // supabase-js v2.108.2 uses the legacy storage key 'supabase.auth.token'
    // when no explicit auth.storageKey is configured. Set the most common
    // shapes for safety across versions.
    const keys = [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-localhost-auth-token',
    ];
    for (const k of keys) {
      try {
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  });

  return { setActiveTrip, setAssignments };
}
