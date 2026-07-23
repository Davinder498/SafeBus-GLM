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
  secondAssignmentId: '88888888-8888-8888-8888-888888888888',
  tripPatternId: '99999999-9999-9999-9999-999999999999',
  secondTripPatternId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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

interface MockDriverAssignmentRpcRow {
  assignment_id: string;
  bus_id: string;
  route_id: string;
  route_trip_pattern_id: string;
  trip_name: string;
  direction: 'forward' | 'reverse';
  route_name: string;
  route_code: string;
  bus_number: string;
  scheduled_start_time: string | null;
}

function assignmentRow(): MockDriverAssignmentRpcRow {
  return {
    assignment_id: MOCK.assignmentId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    route_trip_pattern_id: MOCK.tripPatternId,
    trip_name: 'North Ridge Outbound',
    direction: 'forward',
    route_name: routeRow.route_name,
    route_code: routeRow.route_code,
    bus_number: busRow.bus_number,
    scheduled_start_time: '08:00:00',
  };
}

function secondAssignmentRow(): MockDriverAssignmentRpcRow {
  return {
    assignment_id: MOCK.secondAssignmentId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    route_trip_pattern_id: MOCK.secondTripPatternId,
    trip_name: 'North Ridge Return',
    direction: 'reverse',
    route_name: routeRow.route_name,
    route_code: routeRow.route_code,
    bus_number: busRow.bus_number,
    scheduled_start_time: '15:30:00',
  };
}

function activeTripRow(assignment: MockDriverAssignmentRpcRow = assignmentRow()) {
  return {
    id: MOCK.tripId,
    tenant_id: MOCK.tenantId,
    driver_id: MOCK.driverId,
    bus_id: MOCK.busId,
    route_id: MOCK.routeId,
    route_trip_pattern_id: assignment.route_trip_pattern_id,
    driver_route_assignment_id: assignment.assignment_id,
    trip_name_snapshot: assignment.trip_name,
    trip_type: 'morning',
    status: 'active',
    service_date: '2025-01-01',
    started_at: '2025-01-01T12:00:00.000Z',
    ended_at: null,
    created_at: '2025-01-01T12:00:00.000Z',
    updated_at: '2025-01-01T12:00:00.000Z',
  };
}

function completedTripRow(trip: ReturnType<typeof activeTripRow> = activeTripRow()) {
  return {
    ...trip,
    status: 'completed',
    ended_at: '2025-01-01T12:30:00.000Z',
  };
}

function completedTripHistoryRow() {
  return {
    driver_trip_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    service_date: '2026-07-21',
    started_at: '2026-07-21T14:00:00.000Z',
    ended_at: '2026-07-21T15:05:00.000Z',
    route_name: 'North Ridge Morning',
    route_code: 'NR-AM',
    trip_name: 'North Ridge Outbound',
    direction: 'forward',
    bus_number: '12',
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

export const unexpectedSupabaseRestAccessHint =
  'Unexpected Supabase REST table access in smoke test. Add an explicit mock for legitimate access, or fix a forbidden direct browser table call.';

export async function blockUnexpectedSupabaseRestAccess(
  route: Route,
  method: string,
  path: string,
) {
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      message: `${unexpectedSupabaseRestAccessHint} Method: ${method}. Path: ${path}.`,
      method,
      path,
    }),
  });
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
  setAssignments: (assignments: MockDriverAssignmentRpcRow[] | null) => void;
}

export interface MockSupabaseOptions {
  withActiveTrip?: boolean;
  withAssignments?: boolean;
  withMultipleAssignments?: boolean;
  withCompletedTrips?: boolean;
  locationUpdateDelayMs?: number;
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
  let currentAssignments: MockDriverAssignmentRpcRow[] | null = opts.withMultipleAssignments
    ? [assignmentRow(), secondAssignmentRow()]
    : opts.withAssignments
      ? [assignmentRow()]
      : null;
  let currentActiveTrip: ReturnType<typeof activeTripRow> | null = opts.withActiveTrip
    ? activeTripRow(currentAssignments?.[0] ?? assignmentRow())
    : null;

  const setActiveTrip = (trip: ReturnType<typeof activeTripRow> | null) => {
    currentActiveTrip = trip;
  };
  const setAssignments = (assignments: MockDriverAssignmentRpcRow[] | null) => {
    currentAssignments = assignments;
  };

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());

    // Test-only guard: intercept any Supabase project host so local DEV .env
    // values never make smoke tests touch a real Supabase API. Everything else
    // (app assets, HMR) is allowed through normally.
    if (!url.hostname.endsWith('.supabase.co')) {
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
              body: JSON.stringify({
                message: 'JSON object requested, multiple (or no) rows returned',
              }),
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
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      // POST (insert a new trip, or call an RPC)
      if (method === 'POST') {
        if (table === 'rpc/get_current_driver_trip_assignments') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(currentAssignments ?? []),
          });
          return;
        }
        if (table === 'rpc/get_driver_completed_trip_history') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(opts.withCompletedTrips ? [completedTripHistoryRow()] : []),
          });
          return;
        }
        if (table === 'rpc/end_driver_trip') {
          const completed = completedTripRow(currentActiveTrip ?? activeTripRow());
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
          const requestBody = route.request().postDataJSON() as { p_assignment_id?: string } | null;
          const selectedAssignment = currentAssignments?.find(
            (assignment) => assignment.assignment_id === requestBody?.p_assignment_id,
          );

          if (!selectedAssignment) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'Assignment is unavailable.' }),
            });
            return;
          }

          // Start the exact selected assignment and preserve its pattern identity.
          const newTrip = activeTripRow(selectedAssignment);
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
          if (opts.locationUpdateDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, opts.locationUpdateDelayMs));
          }
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
        await blockUnexpectedSupabaseRestAccess(route, method, path);
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

      await blockUnexpectedSupabaseRestAccess(route, method, path);
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
      'sb-bppmqykkbhrmotcybxrh-auth-token',
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
