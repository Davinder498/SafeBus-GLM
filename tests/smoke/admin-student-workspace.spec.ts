import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const IDS = {
  profile: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenant: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  student: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  school: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  secondSchool: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  assignment: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  service: '11111111-1111-1111-1111-111111111111',
  bus: '22222222-2222-2222-2222-222222222222',
  route: '33333333-3333-3333-3333-333333333333',
  pickup: '44444444-4444-4444-4444-444444444444',
  dropoff: '55555555-5555-5555-5555-555555555555',
} as const;

const profile = {
  id: IDS.profile,
  tenant_id: IDS.tenant,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const schools = [
  { id: IDS.school, tenant_id: IDS.tenant, name: 'Prairie School', status: 'active' },
  { id: IDS.secondSchool, tenant_id: IDS.tenant, name: 'River School', status: 'active' },
];

const bus = {
  id: IDS.bus,
  tenant_id: IDS.tenant,
  school_id: IDS.school,
  bus_number: '42',
  license_plate: 'TEST-42',
  capacity: 48,
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const routeRecord = {
  id: IDS.route,
  tenant_id: IDS.tenant,
  school_id: IDS.school,
  route_name: 'North Loop',
  route_code: 'NL-1',
  route_type: 'morning',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const stops = [
  {
    id: IDS.pickup,
    tenant_id: IDS.tenant,
    route_id: IDS.route,
    school_id: IDS.school,
    stop_name: 'Community Centre',
    stop_order: 1,
    planned_arrival_time: '08:00:00',
    latitude: null,
    longitude: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: IDS.dropoff,
    tenant_id: IDS.tenant,
    route_id: IDS.route,
    school_id: IDS.school,
    stop_name: 'Prairie School Entrance',
    stop_order: 2,
    planned_arrival_time: '08:20:00',
    latitude: null,
    longitude: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  },
];

async function installWorkspaceMock(
  page: Page,
  options: { status?: 'active' | 'inactive'; withAssignment?: boolean; missing?: boolean } = {},
) {
  let student = {
    id: IDS.student,
    tenant_id: IDS.tenant,
    school_id: IDS.school,
    first_name: 'Avery',
    last_name: 'Johnson',
    preferred_name: null,
    grade: 'Grade 4',
    status: options.status ?? 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
  let deleted = options.missing ?? false;
  let assignmentActive = options.withAssignment ?? true;
  let qrActive = false;

  const service = {
    id: IDS.service,
    tenant_id: IDS.tenant,
    bus_id: IDS.bus,
    route_id: IDS.route,
    route_trip_pattern_id: null,
    trip_type: 'morning',
    effective_from: '2025-01-01',
    effective_to: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
  const assignment = () => ({
    id: IDS.assignment,
    tenant_id: IDS.tenant,
    student_id: IDS.student,
    bus_route_assignment_id: IDS.service,
    route_trip_pattern_id: null,
    pickup_stop_id: IDS.pickup,
    dropoff_stop_id: IDS.dropoff,
    effective_from: '2025-01-06',
    effective_to: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  });

  await page.route('**/*', async (requestRoute: Route) => {
    const url = new URL(requestRoute.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await requestRoute.fallback();
      return;
    }
    const method = requestRoute.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        await requestRoute.fulfill({
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
      await requestRoute.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (!path.startsWith('/rest/v1/')) {
      await requestRoute.fallback();
      return;
    }

    const fulfillRows = async (rows: Record<string, unknown>[]) => {
      const accept = requestRoute.request().headers().accept ?? '';
      const wantsSingle = accept.includes('application/vnd.pgrst.object+json');
      await requestRoute.fulfill({
        status: wantsSingle && rows.length === 0 ? 406 : 200,
        contentType: 'application/json',
        body: JSON.stringify(wantsSingle ? (rows[0] ?? { message: 'no rows' }) : rows),
      });
    };

    if (method === 'GET') {
      if (path.includes('/profiles')) return void (await fulfillRows([profile]));
      if (path.includes('/student_bus_assignments')) {
        return void (await fulfillRows(assignmentActive ? [assignment()] : []));
      }
      if (path.includes('/student_guardians')) return void (await fulfillRows([]));
      if (path.includes('/bus_route_assignments')) return void (await fulfillRows([service]));
      if (path.includes('/buses')) return void (await fulfillRows([bus]));
      if (path.includes('/routes')) return void (await fulfillRows([routeRecord]));
      if (path.includes('/route_stops')) {
        const idFilter = url.searchParams.get('id');
        const rows = idFilter?.includes(IDS.pickup)
          ? [stops[0]]
          : idFilter?.includes(IDS.dropoff)
            ? [stops[1]]
            : stops;
        return void (await fulfillRows(rows));
      }
      if (path.includes('/schools')) {
        if (!url.searchParams.get('id')) return void (await fulfillRows(schools));
        const selected = schools.find((school) => school.id === student.school_id);
        return void (await fulfillRows(selected ? [{ ...selected }] : schools));
      }
      if (path.includes('/students')) {
        return void (await fulfillRows(deleted ? [] : [student]));
      }
      await blockUnexpectedSupabaseRestAccess(requestRoute, method, path);
      return;
    }

    if (method === 'PATCH' && path.includes('/students')) {
      student = { ...student, ...requestRoute.request().postDataJSON() };
      await fulfillRows([student]);
      return;
    }
    if (method === 'DELETE' && path.includes('/students')) {
      deleted = true;
      await requestRoute.fulfill({ status: 204, body: '' });
      return;
    }
    if (method === 'PATCH' && path.includes('/student_bus_assignments')) {
      const body = requestRoute.request().postDataJSON() as { status?: string };
      if (body.status === 'inactive') assignmentActive = false;
      await fulfillRows([{ ...assignment(), ...body }]);
      return;
    }
    if (method === 'POST' && path.includes('/student_bus_assignments')) {
      assignmentActive = true;
      await fulfillRows([assignment()]);
      return;
    }
    if (method === 'POST' && path.includes('/rpc/get_admin_bus_services')) {
      await fulfillRows([
        {
          ...service,
          bus_number: bus.bus_number,
          route_name: routeRecord.route_name,
          route_code: routeRecord.route_code,
          trip_name: 'Morning run',
          direction: 'forward',
        },
      ]);
      return;
    }
    if (method === 'POST' && path.includes('/rpc/get_admin_student_qr_credential_status')) {
      await fulfillRows([
        {
          student_id: IDS.student,
          has_active_credential: qrActive,
          credential_status: qrActive ? 'active' : null,
          credential_created_at: qrActive ? '2025-01-01T00:00:00.000Z' : null,
        },
      ]);
      return;
    }
    if (method === 'POST' && path.includes('/rpc/manage_student_qr_credential')) {
      const action = (requestRoute.request().postDataJSON() as { p_action: string }).p_action;
      qrActive = action !== 'revoke';
      await fulfillRows([
        {
          student_id: IDS.student,
          credential_id: qrActive ? '66666666-6666-6666-6666-666666666666' : null,
          status: qrActive ? 'active' : 'revoked',
          raw_token: qrActive ? 'one-time-test-token' : null,
          created_at: '2025-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (
      method === 'POST' &&
      (path.includes('/rpc/get_admin_paginated_list') ||
        path.includes('/rpc/get_admin_students_page'))
    ) {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: deleted ? [] : [{ ...student, school_name: 'Prairie School' }],
          totalCount: deleted ? 0 : 1,
          page: 1,
          pageSize: 50,
        }),
      });
      return;
    }

    await blockUnexpectedSupabaseRestAccess(requestRoute, method, path);
  });

  await page.addInitScript(() => {
    const session = {
      access_token: 'x',
      refresh_token: 'x',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'admin@smoke-test.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2025-01-01T00:00:00.000Z',
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
  });
}

test.describe('Admin student workspace', () => {
  test('shows every management section and keeps transportation in its own card', async ({
    page,
  }) => {
    await installWorkspaceMock(page);
    await page.goto(`/admin/students/${IDS.student}`);

    await expect(page.getByRole('heading', { name: 'Avery Johnson', level: 1 })).toBeVisible();
    for (const heading of [
      'Student details',
      'Guardians',
      'Transportation',
      'QR badge',
      'Student status',
      'Danger zone',
    ]) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    const details = page.getByTestId('student-details-section');
    await expect(details).toContainText('Prairie School');
    await expect(details).not.toContainText('Bus 42');
    const transportation = page.getByTestId('student-transportation-section');
    await expect(transportation).toContainText('Bus 42');
    await expect(transportation).toContainText('NL-1 · North Loop');
    await expect(transportation).toContainText('Morning');
    await expect(transportation).toContainText('Community Centre');
    await expect(transportation).toContainText('Prairie School Entrance');
  });

  test('edits student details in the card position', async ({ page }) => {
    await installWorkspaceMock(page);
    await page.goto(`/admin/students/${IDS.student}`);

    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByRole('heading', { name: 'Edit student details' })).toBeVisible();
    await page.getByLabel('Grade (optional)').fill('Grade 5');
    await page.getByLabel('School (optional)').selectOption(IDS.secondSchool);
    await page.getByRole('button', { name: 'Save student' }).click();

    await expect(page.getByText('Student details updated.')).toBeVisible();
    await expect(page.getByTestId('student-details-section')).toContainText('Grade 5');
    await expect(page.getByTestId('student-details-section')).toContainText('River School');
  });

  test('manages and removes transportation inside the transportation card', async ({ page }) => {
    await installWorkspaceMock(page);
    await page.goto(`/admin/students/${IDS.student}`);

    await page.getByRole('button', { name: 'Manage transportation' }).click();
    const transportation = page.getByTestId('student-transportation-section');
    await expect(transportation.getByLabel('Bus service')).toBeVisible();
    await transportation.getByRole('button', { name: 'Save assignment' }).click();
    await expect(page.getByText('Student transportation updated.')).toBeVisible();

    await page.getByRole('button', { name: 'Manage transportation' }).click();
    await page.getByRole('button', { name: 'Remove bus assignment' }).click();
    await expect(page.getByText('Bus assignment removed.')).toBeVisible();
    await expect(page.getByTestId('student-transportation-section')).toContainText('Not assigned');
  });

  test('generates a QR badge from the workspace', async ({ page }) => {
    await installWorkspaceMock(page);
    await page.goto(`/admin/students/${IDS.student}`);

    await expect(page.getByText('No active credential')).toBeVisible();
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByTestId('admin-qr-generation-result')).toBeVisible();
    await expect(page.getByText('Active credential')).toBeVisible();
  });

  test('gates inactive operations and restores them after reactivation', async ({ page }) => {
    await installWorkspaceMock(page, { status: 'inactive' });
    await page.goto(`/admin/students/${IDS.student}`);

    await expect(
      page.getByText('Reactivate the student to manage their transportation.'),
    ).toBeVisible();
    await expect(page.getByText('Reactivate the student to manage their QR badge.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Manage transportation' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Reactivate student' }).click();
    await expect(
      page.getByText('Student returned to the active transportation roster.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage transportation' })).toBeVisible();
  });

  test('confirms deletion and returns to the roster', async ({ page }) => {
    await installWorkspaceMock(page);
    await page.goto(`/admin/students/${IDS.student}`);

    await page.getByRole('button', { name: 'Delete student' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete student' }).click();
    await expect(page).toHaveURL('/admin/students');
  });

  test('shows the unavailable state when the student cannot be loaded', async ({ page }) => {
    await installWorkspaceMock(page, { missing: true });
    await page.goto(`/admin/students/${IDS.student}`);
    await expect(page.getByText('Student unavailable')).toBeVisible();
    await expect(page.getByText('This student is not available.')).toBeVisible();
  });

  test('keeps the workspace within a mobile viewport', async ({ page }) => {
    await installWorkspaceMock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/students/${IDS.student}`);
    await expect(page.getByRole('heading', { name: 'Student details' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
