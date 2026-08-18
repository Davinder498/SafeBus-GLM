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
  options: { rows?: GuardianVisibilityRow[]; fail?: boolean; role?: Role; rawError?: string } = {},
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
  let fail = options.fail ?? false;
  let calls = 0;

  await page.route('**/*', async (requestRoute: Route) => {
    const url = new URL(requestRoute.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return requestRoute.fallback();
    const method = requestRoute.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      const body = path.includes('/user')
        ? { id: profile.id, email: profile.email, role: 'authenticated', aud: 'authenticated' }
        : {};
      return requestRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (!path.startsWith('/rest/v1/')) return requestRoute.fallback();
    if (method === 'GET' && path.includes('/profiles')) {
      const single = (requestRoute.request().headers().accept ?? '').includes('object+json');
      return requestRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? profile : [profile]) });
    }
    if (method === 'POST' && path.includes('/rpc/get_guardian_bus_visibility_v2')) {
      calls += 1;
      return requestRoute.fulfill({
        status: fail ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(fail ? { message: options.rawError ?? 'private backend error' } : rows),
      });
    }
    return blockUnexpectedSupabaseRestAccess(requestRoute, method, path);
  });

  await page.addInitScript((sessionProfile) => {
    const session = {
      access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ', 'smoke-test-signature'].join('.'),
      refresh_token: 'test', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: sessionProfile.id, email: sessionProfile.email, role: 'authenticated', aud: 'authenticated' },
    };
    for (const key of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) {
      window.localStorage.setItem(key, JSON.stringify(session));
    }
  }, profile);

  return {
    setRows(nextRows: GuardianVisibilityRow[]) { rows = nextRows; },
    setFail(nextFail: boolean) { fail = nextFail; },
    getCallCount() { return calls; },
  };
}
