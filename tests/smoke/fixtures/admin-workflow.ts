import { type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './supabase-mock';

export const ADMIN_IDS = {
  profile: '11111111-1111-1111-1111-111111111111',
  tenant: '22222222-2222-2222-2222-222222222222',
  driver: '33333333-3333-3333-3333-333333333333',
  bus: '44444444-4444-4444-4444-444444444444',
  route: '55555555-5555-5555-5555-555555555555',
  inactiveRoute: '55555555-5555-5555-5555-555555555556',
  assignment: '66666666-6666-6666-6666-666666666666',
  trip: '77777777-7777-7777-7777-777777777777',
} as const;

type AdminWorkflowRole = 'tenant_admin' | 'guardian';

function profile(role: AdminWorkflowRole = 'tenant_admin') {
  return {
    id: ADMIN_IDS.profile,
    tenant_id: ADMIN_IDS.tenant,
    school_id: null,
    full_name: 'Test Admin',
    email: 'admin@example.test',
    role,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/**
 * Install the deterministic tenant-admin browser fixture used by workflow and
 * accessibility tests. All Supabase traffic is intercepted; no hosted project
 * or production data is accessed.
 */
export async function installAdminWorkflowMock(
  page: Page,
  role: AdminWorkflowRole = 'tenant_admin',
) {
  const currentProfile = profile(role);
  await page.addInitScript(
    ({ userProfile }) => {
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
          id: userProfile.id,
          email: userProfile.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: userProfile.created_at,
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
    { userProfile: currentProfile },
  );

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }

    const path = url.pathname;
    const method = route.request().method();
    if (path.startsWith('/auth/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          path.endsWith('/user')
            ? {
                id: currentProfile.id,
                email: currentProfile.email,
                role: 'authenticated',
                aud: 'authenticated',
              }
            : {},
        ),
      });
      return;
    }
    if (!path.startsWith('/rest/v1/')) {
      await route.fallback();
      return;
    }
    if (path.includes('/profiles')) {
      const single = (route.request().headers().accept ?? '').includes('object+json');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? currentProfile : [currentProfile]),
      });
      return;
    }
    if (method === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    if (path.includes('/rpc/get_admin_live_fleet_monitoring')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (path.includes('/rpc/get_admin_trip_overview')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            trip_id: ADMIN_IDS.trip,
            service_date: '2026-01-01',
            status: 'active',
            started_at: '2026-01-01T08:00:00Z',
            ended_at: null,
            route_name: 'Route One',
            route_code: 'R1',
            trip_pattern_name: 'Morning service',
            direction: 'forward',
            bus_label: 'Bus One',
            driver_label: 'Test Driver',
          },
        ]),
      });
      return;
    }
    if (path.includes('/rpc/get_tenant_notification_delivery_summary')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            pending_count: 1,
            processing_count: 0,
            delivered_count_recent: 5,
            failed_count_recent: 1,
            cancelled_count_recent: 2,
            oldest_pending_age_seconds: 1800,
            recent_failure_categories: [{ category: 'permanent_provider_error', count: 1 }],
          },
        ]),
      });
      return;
    }

    const rows: Record<string, unknown[]> = {
      driver_trips: [
        {
          id: ADMIN_IDS.trip,
          tenant_id: ADMIN_IDS.tenant,
          driver_id: ADMIN_IDS.driver,
          bus_id: ADMIN_IDS.bus,
          route_id: ADMIN_IDS.route,
          trip_type: 'morning',
          status: 'active',
          service_date: '2026-01-01',
          started_at: '2026-01-01T08:00:00Z',
          ended_at: null,
          created_at: '2026-01-01T08:00:00Z',
          updated_at: '2026-01-01T08:00:00Z',
        },
      ],
      driver_route_assignments: [
        {
          id: ADMIN_IDS.assignment,
          tenant_id: ADMIN_IDS.tenant,
          driver_id: ADMIN_IDS.driver,
          bus_id: ADMIN_IDS.bus,
          route_id: ADMIN_IDS.route,
          trip_type: 'morning',
          status: 'active',
          effective_from: null,
          effective_to: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      buses: [
        {
          id: ADMIN_IDS.bus,
          tenant_id: ADMIN_IDS.tenant,
          school_id: null,
          bus_number: 'One',
          license_plate: null,
          capacity: 40,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      drivers: [
        {
          id: ADMIN_IDS.driver,
          tenant_id: ADMIN_IDS.tenant,
          profile_id: ADMIN_IDS.profile,
          employee_number: 'D1',
          phone: null,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      routes: [
        {
          id: ADMIN_IDS.route,
          tenant_id: ADMIN_IDS.tenant,
          school_id: null,
          route_name: 'Route One',
          route_code: 'R1',
          route_type: 'morning',
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: ADMIN_IDS.inactiveRoute,
          tenant_id: ADMIN_IDS.tenant,
          school_id: null,
          route_name: 'Route Two',
          route_code: 'R2',
          route_type: 'afternoon',
          status: 'inactive',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      route_stops: [
        {
          id: '88888888-8888-8888-8888-888888888888',
          tenant_id: ADMIN_IDS.tenant,
          route_id: ADMIN_IDS.route,
          stop_name: 'Pickup Stop',
          stop_order: 1,
          planned_arrival_time: '08:00:00',
          latitude: 51.0447,
          longitude: -114.0719,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      schools: [],
    };
    const table = path.split('/').pop() ?? '';
    if (table === 'get_admin_dashboard_overview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          routes: rows.routes.map((route, index) => ({
            ...route,
            stop_count: index === 0 ? 1 : 0,
            active_assignment_count: index === 0 ? 1 : 0,
            priority: index + 1,
          })),
        }),
      });
      return;
    }
    if (table in rows) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows[table]),
      });
      return;
    }
    await blockUnexpectedSupabaseRestAccess(route, method, path);
  });
}
