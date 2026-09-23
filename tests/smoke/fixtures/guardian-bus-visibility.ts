import type { Page, Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './supabase-mock';

export const GUARDIAN_STUDENT_ID = '33333333-3333-3333-3333-333333333333';

export type GuardianVisibilityRow = {
  student_id: string;
  student_name: string;
  student_grade: string | null;
  assignment_state: 'assigned' | 'unassigned' | 'unavailable';
  bus_number: string | null;
  license_plate: string | null;
  has_active_trip: boolean;
  location_state: 'inactive' | 'fresh' | 'stale' | 'missing' | 'invalid';
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
  location_age_seconds: number | null;
  eta_status: string | null;
  eta_label: string | null;
  student_trip_status: 'no_active_trip' | 'not_picked_up' | 'picked_up' | 'dropped_off';
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  last_event_time: string | null;
};

export type GuardianBusServiceLineRow = {
  busNumber: string;
  licensePlate: string | null;
  routeName: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  tripStatus: 'active' | 'paused' | 'inactive';
  locationState: 'inactive' | 'fresh' | 'stale' | 'missing' | 'invalid';
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  progressPercent: number | null;
  progressSource: 'route_shape' | 'stop_sequence' | null;
  nextStopName: string | null;
  nextStopOrder: number | null;
  etaUpdatedAt: string | null;
  stops: Array<{
    name: string;
    order: number;
    latitude: number | null;
    longitude: number | null;
    plannedArrivalTime: string | null;
    serviceState: 'passed' | 'at_stop' | 'next' | 'upcoming' | 'unavailable';
    etaStatus: 'available' | 'arriving_soon' | 'passed' | 'paused' | 'unavailable';
    etaMinMinutes: number | null;
    etaMaxMinutes: number | null;
    etaLabel: string;
  }>;
};

export type GuardianStudentStopRow = {
  student_id: string;
  bus_number: string;
  trip_name: string;
  direction: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
};

export function guardianBusServiceLine(
  overrides: Partial<GuardianBusServiceLineRow> = {},
): GuardianBusServiceLineRow {
  return {
    busNumber: '42',
    licensePlate: 'TEST-42',
    routeName: 'Cedar School Line',
    tripName: 'Morning school run',
    direction: 'forward',
    tripStatus: 'active',
    locationState: 'fresh',
    latitude: 51.047,
    longitude: -114.0719,
    locationRecordedAt: '2026-01-01T15:00:00.000Z',
    progressPercent: 25,
    progressSource: 'route_shape',
    nextStopName: 'Cedar Avenue',
    nextStopOrder: 2,
    etaUpdatedAt: '2026-01-01T15:00:00.000Z',
    stops: [
      {
        name: 'North Terminal',
        order: 1,
        latitude: 51.044,
        longitude: -114.0719,
        plannedArrivalTime: '08:00:00',
        serviceState: 'passed',
        etaStatus: 'passed',
        etaMinMinutes: null,
        etaMaxMinutes: null,
        etaLabel: 'Passed',
      },
      {
        name: 'Cedar Avenue',
        order: 2,
        latitude: 51.05,
        longitude: -114.0719,
        plannedArrivalTime: '08:12:00',
        serviceState: 'next',
        etaStatus: 'available',
        etaMinMinutes: 6,
        etaMaxMinutes: 9,
        etaLabel: '6–9 min',
      },
      {
        name: 'Riverside School',
        order: 3,
        latitude: 51.056,
        longitude: -114.0719,
        plannedArrivalTime: '08:25:00',
        serviceState: 'upcoming',
        etaStatus: 'available',
        etaMinMinutes: 19,
        etaMaxMinutes: 26,
        etaLabel: '19–26 min',
      },
    ],
    ...overrides,
  };
}

export function guardianVisibilityRow(
  overrides: Partial<GuardianVisibilityRow> = {},
): GuardianVisibilityRow {
  return {
    student_id: GUARDIAN_STUDENT_ID,
    student_name: 'Avery Johnson',
    student_grade: 'Grade 4',
    assignment_state: 'assigned',
    bus_number: '42',
    license_plate: 'TEST-42',
    has_active_trip: true,
    location_state: 'fresh',
    latitude: 51.0447,
    longitude: -114.0719,
    location_recorded_at: '2026-01-01T15:00:00.000Z',
    location_age_seconds: 20,
    eta_status: 'unavailable',
    eta_label: 'ETA temporarily unavailable',
    student_trip_status: 'not_picked_up',
    pickup_event_time: null,
    dropoff_event_time: null,
    last_event_time: null,
    ...overrides,
  };
}

type Role = 'guardian' | 'tenant_admin' | 'driver';

export async function installGuardianVisibilityMock(
  page: Page,
  options: {
    rows?: GuardianVisibilityRow[];
    serviceLines?: GuardianBusServiceLineRow[];
    studentStops?: GuardianStudentStopRow[];
    fail?: boolean;
    failServiceLines?: boolean;
    role?: Role;
    rawError?: string;
  } = {},
) {
  const role = options.role ?? 'guardian';
  const profile = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    school_id: null,
    full_name: `Test ${role}`,
    email: `${role}@smoke-test.local`,
    role,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  let rows = options.rows ?? [];
  let serviceLines = options.serviceLines ?? [guardianBusServiceLine()];
  const studentStops = options.studentStops ?? [];
  let fail = options.fail ?? false;
  let calls = 0;
  let deviceCalls = 0;

  await page.route('**/*', async (requestRoute: Route) => {
    const url = new URL(requestRoute.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return requestRoute.fallback();
    const method = requestRoute.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      const body = path.includes('/user')
        ? { id: profile.id, email: profile.email, role: 'authenticated', aud: 'authenticated' }
        : {};
      return requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    if (!path.startsWith('/rest/v1/')) return requestRoute.fallback();
    if (method === 'GET' && path.includes('/profiles')) {
      const single = (requestRoute.request().headers().accept ?? '').includes('object+json');
      return requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? profile : [profile]),
      });
    }
    if (method === 'POST' && path.includes('/rpc/get_notification_preferences')) {
      return requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pushEnabled: true,
          quietHoursEnabled: true,
          quietHoursStart: '21:00',
          quietHoursEnd: '07:00',
          timezone: 'America/Edmonton',
          timezoneOverride: null,
          urgentBypassQuietHours: true,
          previewMode: 'generic',
          categories: {
            pickup_dropoff: true,
            trip_status: true,
            service_changes: true,
            assignments: false,
            operations: false,
          },
        }),
      });
    }
    if (method === 'POST' && path.includes('/rpc/list_own_push_devices')) {
      deviceCalls += 1;
      return requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'device-active',
            installation_id: 'install-active',
            device_model: 'Vivo V2225',
            app_version: '1.0.0',
            permission_state: 'granted',
            status: 'active',
            last_registered_at: '2026-09-01T12:00:00.000Z',
            last_seen_at: '2026-09-01T12:00:00.000Z',
          },
          {
            id: 'device-revoked',
            installation_id: 'install-revoked',
            device_model: 'Old Android device',
            app_version: '0.9.0',
            permission_state: 'denied',
            status: 'revoked',
            last_registered_at: '2026-08-01T12:00:00.000Z',
            last_seen_at: '2026-08-01T12:00:00.000Z',
          },
        ]),
      });
    }
    if (method === 'POST' && path.includes('/rpc/get_guardian_bus_visibility_v2')) {
      calls += 1;
      return requestRoute.fulfill({
        status: fail ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          fail ? { message: options.rawError ?? 'private backend error' } : rows,
        ),
      });
    }
    if (method === 'POST' && path.includes('/rpc/get_guardian_student_stops')) {
      return requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(studentStops),
      });
    }
    if (method === 'POST' && path.includes('/rpc/get_guardian_bus_service_lines')) {
      const requestedBus = String(
        (requestRoute.request().postDataJSON() as { p_bus_number?: unknown } | null)
          ?.p_bus_number ?? '',
      ).toLocaleLowerCase();
      return requestRoute.fulfill({
        status: options.failServiceLines ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          options.failServiceLines
            ? { message: options.rawError ?? 'private backend error' }
            : serviceLines.filter((line) => line.busNumber.toLocaleLowerCase() === requestedBus),
        ),
      });
    }
    return blockUnexpectedSupabaseRestAccess(requestRoute, method, path);
  });

  await page.addInitScript((sessionProfile) => {
    const session = {
      access_token: [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ',
        'smoke-test-signature',
      ].join('.'),
      refresh_token: 'test',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: sessionProfile.id,
        email: sessionProfile.email,
        role: 'authenticated',
        aud: 'authenticated',
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
  }, profile);

  return {
    setRows(nextRows: GuardianVisibilityRow[]) {
      rows = nextRows;
    },
    setServiceLines(nextLines: GuardianBusServiceLineRow[]) {
      serviceLines = nextLines;
    },
    setFail(nextFail: boolean) {
      fail = nextFail;
    },
    getCallCount() {
      return calls;
    },
    getDeviceCallCount() {
      return deviceCalls;
    },
  };
}
