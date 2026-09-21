import { expect, test, type Page, type Route } from '@playwright/test';

const profile = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: '22222222-2222-2222-2222-222222222222',
  school_id: null,
  full_name: 'Route Admin',
  email: 'route-admin@example.test',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

interface ExistingRouteFixture {
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown>>;
  tripPatterns: Array<Record<string, unknown>>;
  tripSchedules?: Array<Record<string, unknown>>;
  serviceDays?: Array<Record<string, unknown>>;
}

async function mockRoutes(page: Page, role = 'tenant_admin', existingRoute?: ExistingRouteFixture) {
  let savedPayload: Record<string, unknown> | null = null;
  let savedServiceDays: Array<Record<string, unknown>> | null = null;
  const currentProfile = { ...profile, role };
  await page.addInitScript(
    ({ user }) => {
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
          id: user.id,
          email: user.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: user.created_at,
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
    { user: currentProfile },
  );

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return route.fallback();
    const path = url.pathname;
    const method = route.request().method();
    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({
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
    }
    if (path.includes('/profiles')) {
      const single = (route.request().headers().accept ?? '').includes('object+json');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? currentProfile : [currentProfile]),
      });
    }
    if (path.includes('/rpc/get_admin_paginated_list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: existingRoute ? [existingRoute.route] : [],
          totalCount: existingRoute ? 1 : 0,
          page: 1,
          pageSize: 50,
        }),
      });
    }
    if (path.includes('/rpc/admin_save_route_definition')) {
      savedPayload = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          routeId:
            (existingRoute?.route.id as string | undefined) ??
            '33333333-3333-3333-3333-333333333333',
          definitionStatus: 'ready',
          activeStopCount: existingRoute ? existingRoute.stops.length + 1 : 2,
        }),
      });
    }
    if (path.includes('/route_service_days') && method === 'POST') {
      savedServiceDays = route.request().postDataJSON() as Array<Record<string, unknown>>;
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (existingRoute && method === 'GET') {
      const rows = path.includes('/route_trip_stop_schedules')
        ? (existingRoute.tripSchedules ?? [])
        : path.includes('/route_trip_patterns')
          ? existingRoute.tripPatterns
          : path.includes('/route_service_days')
            ? (existingRoute.serviceDays ?? [])
            : path.includes('/route_stops')
              ? existingRoute.stops
              : path.includes('/routes')
                ? [existingRoute.route]
                : null;
      if (rows) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rows),
        });
      }
    }
    if (path.startsWith('/rest/v1/') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return {
    savedPayload: () => savedPayload,
    savedServiceDays: () => savedServiceDays,
  };
}

test.describe('route corridor and named trips', () => {
  test('tenant admin atomically saves two directions and coordinate-complete terminals', async ({
    page,
  }) => {
    const mock = await mockRoutes(page);
    await page.goto('/admin/routes');
    await expect(page.getByRole('heading', { name: 'Route corridors and trips' })).toBeVisible();
    await page.getByRole('button', { name: 'Add route' }).click();

    await page.getByLabel('Route name').fill('Route 1');
    await page.getByLabel('Route code').fill('R-1');
    await page.getByLabel('Trip name').nth(0).fill('Up');
    await page.getByLabel('Trip name').nth(1).fill('Down');
    await page.getByRole('button', { name: 'Add stop' }).click();
    await expect(page.getByRole('button', { name: 'Add stop' })).toBeDisabled();
    await page.getByLabel('Stop name').fill('Point A');
    await page.getByLabel('Latitude').fill('51.0447');
    await page.getByLabel('Longitude').fill('-114.0719');
    await page.getByRole('button', { name: 'Save stop details' }).click();

    await expect(page.getByRole('button', { name: 'Add stop' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add stop' }).click();
    await page.getByLabel('Stop name').fill('Point B');
    await page.getByLabel('Latitude').fill('51.055');
    await page.getByLabel('Longitude').fill('-114.05');
    await page.getByRole('button', { name: 'Save stop details' }).click();
    await page.getByLabel('Status').first().selectOption('active');
    await page.getByLabel('Sunday').check();
    await page.getByLabel('Friday').uncheck();
    await page.getByRole('button', { name: 'Save route definition' }).click();

    await expect(page.getByText('Route corridor and trips created.')).toBeVisible();
    const payload = mock.savedPayload() as {
      p_stops: Array<{ stopName: string; stopOrder: number }>;
      p_trip_patterns: Array<{ direction: string; displayName: string }>;
    };
    expect(payload.p_stops.map((stop) => [stop.stopName, stop.stopOrder])).toEqual([
      ['Point A', 1],
      ['Point B', 2],
    ]);
    expect(payload.p_trip_patterns.map((trip) => [trip.direction, trip.displayName])).toEqual([
      ['forward', 'Up'],
      ['reverse', 'Down'],
    ]);
    const serviceDays = mock.savedServiceDays() as Array<{
      day_of_week: number;
      status: string;
    }>;
    expect(
      serviceDays.filter((day) => day.status === 'active').map((day) => day.day_of_week),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  test('field-trip corridor preserves canonical order after accessible reordering', async ({
    page,
  }) => {
    const mock = await mockRoutes(page);
    await page.goto('/admin/routes');
    await page.getByRole('button', { name: 'Add route' }).click();

    await page.getByLabel('Route name').fill('Museum Day');
    await page.getByLabel('Route code').fill('FIELD-1');
    await page.getByLabel('Route kind').selectOption('field_trip');
    await page.getByLabel('Trip name').nth(0).fill('Museum Outbound');
    await page.getByLabel('Trip name').nth(1).fill('Museum Home');

    const stopNames = ['School', 'Museum', 'Lunch stop'];
    for (let index = 0; index < stopNames.length; index += 1) {
      await page.getByRole('button', { name: 'Add stop' }).click();
      await page.getByLabel('Stop name').fill(stopNames[index]);
      await page.getByLabel('Latitude').fill(String(51.04 + index * 0.01));
      await page.getByLabel('Longitude').fill(String(-114.07 + index * 0.01));
      await page.getByRole('button', { name: 'Save stop details' }).click();
    }

    await page.getByRole('button', { name: 'Down' }).first().click();
    await page.getByRole('button', { name: /Start stop/ }).click();
    await expect(page.getByLabel('Stop name')).toHaveValue('Museum');
    await page.getByLabel('Status').first().selectOption('active');
    await page.getByRole('button', { name: 'Save route definition' }).click();

    const payload = mock.savedPayload() as {
      p_route: { routeKind: string };
      p_stops: Array<{ stopName: string; stopOrder: number }>;
    };
    expect(payload.p_route.routeKind).toBe('field_trip');
    expect(payload.p_stops.map((stop) => [stop.stopName, stop.stopOrder])).toEqual([
      ['Museum', 1],
      ['School', 2],
      ['Lunch stop', 3],
    ]);
  });

  test('editing an existing route keeps its identity while adding a stop', async ({ page }) => {
    const routeId = '33333333-3333-3333-3333-333333333333';
    const tenantId = profile.tenant_id;
    const routeRecord = {
      id: routeId,
      tenant_id: tenantId,
      school_id: null,
      route_name: 'Demo Route 01',
      route_code: 'DR01',
      route_type: 'special',
      route_kind: 'regular',
      map_color: '#2563EB',
      definition_status: 'ready',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      school_name: null,
      stop_count: 2,
      active_assignment_count: 0,
    };
    const stops = [
      {
        id: '44444444-4444-4444-4444-444444444441',
        tenant_id: tenantId,
        route_id: routeId,
        school_id: null,
        stop_name: 'First stop',
        stop_order: 1,
        planned_arrival_time: null,
        latitude: 51.04,
        longitude: -114.07,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '44444444-4444-4444-4444-444444444442',
        tenant_id: tenantId,
        route_id: routeId,
        school_id: null,
        stop_name: 'Last stop',
        stop_order: 2,
        planned_arrival_time: null,
        latitude: 51.05,
        longitude: -114.06,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const tripPatterns = ['forward', 'reverse'].map((direction, index) => ({
      id: `55555555-5555-5555-5555-55555555555${index + 1}`,
      tenant_id: tenantId,
      route_id: routeId,
      direction,
      display_name: direction === 'forward' ? 'Outbound' : 'Return',
      status: 'active',
      schedule_review_required: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));
    const mock = await mockRoutes(page, 'tenant_admin', {
      route: routeRecord,
      stops,
      tripPatterns,
    });

    await page.goto('/admin/routes');
    await page.getByRole('button', { name: 'Edit route' }).click();
    await expect(page.getByRole('heading', { name: 'Edit DR01' })).toBeVisible();
    await page.getByRole('button', { name: 'Add stop' }).click();
    await page.getByLabel('Stop name').fill('New stop');
    await page.getByLabel('Latitude').fill('51.06');
    await page.getByLabel('Longitude').fill('-114.05');
    await page.getByRole('button', { name: 'Save stop details' }).click();
    await page.getByRole('button', { name: 'Save route definition' }).click();

    await expect(page.getByText('Route definition updated.')).toBeVisible();
    const payload = mock.savedPayload() as {
      p_route: { id?: string; routeCode: string };
      p_stops: Array<{ stopName: string }>;
    };
    expect(payload.p_route).toMatchObject({ id: routeId, routeCode: 'DR01' });
    expect(payload.p_stops.map((stop) => stop.stopName)).toEqual([
      'First stop',
      'Last stop',
      'New stop',
    ]);
  });

  test('non-tenant admin cannot see route mutation controls', async ({ page }) => {
    await mockRoutes(page, 'school_admin');
    await page.goto('/admin/routes');
    await expect(page.getByRole('heading', { name: 'Route corridors and trips' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add route' })).toHaveCount(0);
  });
});
