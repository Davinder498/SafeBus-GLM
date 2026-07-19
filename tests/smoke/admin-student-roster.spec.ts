import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 5A.1 — Tenant Admin Student Roster smoke tests.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock returns a tenant
 * admin profile so ProtectedRoute admits the caller to /admin/students.
 *
 * Coverage:
 *   1. Page renders with title and Add student button.
 *   2. Admin can create a student (form submits, success appears).
 *   3. Logged-out user is blocked.
 */

const ADMIN = {
  profileId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  studentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
} as const;

const adminProfile = {
  id: ADMIN.profileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const mockStudent = {
  id: ADMIN.studentId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  first_name: 'Avery',
  last_name: 'Johnson',
  preferred_name: null,
  grade: 'Grade 4',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

async function installAdminStudentMock(page: Page, opts: { students?: (typeof mockStudent)[]; totalCount?: number } = {}) {
  let students: Record<string, unknown>[] = opts.students ?? [];

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
            id: adminProfile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: adminProfile.email,
            app_metadata: {},
            user_metadata: {},
            created_at: adminProfile.created_at,
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
              id: adminProfile.id,
              email: adminProfile.email,
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

      if (method === 'GET') {
        if (path.includes('/profiles')) {
          await fulfillRows([adminProfile]);
          return;
        }
        if (path.includes('/students')) {
          await fulfillRows(students);
          return;
        }
        if (path.includes('/schools')) {
          await fulfillRows([]);
          return;
        }
        if (path.includes('/route_stops')) {
          await fulfillRows([
            {
              id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
              tenant_id: ADMIN.tenantId,
              route_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
              school_id: null,
              stop_name: 'Main Stop',
              stop_order: 1,
              planned_arrival_time: '08:00:00',
              latitude: null,
              longitude: null,
              status: 'active',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ]);
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }
      if (method === 'POST' && path.includes('/students')) {
        const newStudent = { ...mockStudent, first_name: 'New', last_name: 'Student' };
        students = [newStudent];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newStudent),
        });
        return;
      }
      if (method === 'POST' && (path.includes('/rpc/get_admin_paginated_list') || path.includes('/rpc/get_admin_students_page'))) {
        const body = route.request().postDataJSON() as { p_page_size?: number };
        const pageSize = body.p_page_size ?? 50;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rows: students.map((student) => ({ ...student, school_name: null })),
            totalCount: opts.totalCount ?? students.length,
            page: 1,
            pageSize,
          }),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/admin_create_student_onboarding')) {
        students = [{ ...mockStudent, first_name: 'New', last_name: 'Student' }];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            studentId: ADMIN.studentId,
            guardianLinkId: null,
            routeId: null,
            busId: null,
            busServiceId: null,
            studentBusAssignmentId: null,
            pickupStopId: null,
            dropoffStopId: null,
          }),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_admin_bus_services')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
              tenant_id: ADMIN.tenantId,
              bus_id: '11111111-2222-3333-4444-555555555555',
              route_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
              trip_type: 'morning',
              effective_from: null,
              effective_to: null,
              status: 'active',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              bus_number: '12',
              route_name: 'Morning Route',
              route_code: 'MR-1',
            },
          ]),
        });
        return;
      }
      if (method === 'POST' && path.includes('/student_bus_assignments')) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '12121212-1212-1212-1212-121212121212',
            tenant_id: ADMIN.tenantId,
            student_id: ADMIN.studentId,
            bus_route_assignment_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            pickup_stop_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            dropoff_stop_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            effective_from: '2025-01-01',
            effective_to: null,
            status: 'active',
          }),
        });
        return;
      }
      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }
    await route.fallback();
  });

  await page.addInitScript(() => {
    const s = {
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
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) {
      try {
        window.localStorage.setItem(k, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    }
  });
}

test.describe('Milestone 5A.1 — Admin student roster', () => {
  test('page renders with title and Add student button', async ({ page }) => {
    await installAdminStudentMock(page);
    await page.goto('/admin/students');

    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: 'Add student' })).toBeVisible();
  });

  test('admin can create a student', async ({ page }) => {
    await installAdminStudentMock(page);
    await page.goto('/admin/students');

    // Wait for the page to load.
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the add-student form.
    await page.getByRole('button', { name: 'Add student' }).click();

    // Fill in first and last name.
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('Student');

    // Save.
    await page.getByRole('button', { name: 'Create student' }).click();

    // Success message appears.
    await expect(page.getByText('Student created.')).toBeVisible({ timeout: 10000 });
  });

  test('student roster uses a bounded server page', async ({ page }) => {
    await installAdminStudentMock(page, { students: [mockStudent] });
    await page.goto('/admin/students');
    await expect(page.getByRole('cell', { name: 'Avery Johnson', exact: true })).toBeVisible();
    await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-1 of 1');
    await expect(page.getByLabel('Rows')).toHaveValue('50');
    await expect(page.getByText('No bus assigned')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign bus' })).toBeVisible();
  });

  test('student actions stay in one compact, labelled row', async ({ page }) => {
    await installAdminStudentMock(page, { students: [mockStudent] });
    await page.goto('/admin/students');

    const actions = page.getByTestId('student-roster-actions');
    await expect(actions).toHaveCSS('flex-wrap', 'nowrap');
    await expect(actions.locator('a, button')).toHaveCount(6);
    await expect(page.getByRole('link', { name: 'View Avery Johnson' })).toHaveAttribute('title', 'View student');
    await expect(page.getByRole('button', { name: 'Edit Avery Johnson' })).toHaveAttribute('title', 'Edit student');
    await expect(page.getByRole('button', { name: 'Assign bus for Avery Johnson' })).toHaveAttribute('title', 'Assign bus');
    await expect(page.getByRole('button', { name: 'Manage QR badge for Avery Johnson' })).toHaveAttribute('title', 'Manage QR badge');
    await expect(page.getByRole('button', { name: 'Deactivate Avery Johnson' })).toHaveAttribute('title', 'Deactivate student');
    await expect(page.getByRole('button', { name: 'Delete Avery Johnson' })).toHaveAttribute('title', 'Delete student');
  });

  test('admin can optionally assign a student to a bus from the student section', async ({ page }) => {
    await installAdminStudentMock(page, { students: [mockStudent] });
    await page.goto('/admin/students');
    await page.getByRole('button', { name: 'Assign bus' }).click();
    await page.getByLabel('Bus service').selectOption('ffffffff-ffff-ffff-ffff-ffffffffffff');
    await page.getByLabel('Pickup stop').selectOption('dddddddd-dddd-dddd-dddd-dddddddddddd');
    await page.getByLabel('Drop-off stop').selectOption('dddddddd-dddd-dddd-dddd-dddddddddddd');
    await page.getByRole('button', { name: 'Save assignment' }).click();
    await expect(page.getByText('Student bus assignment saved.')).toBeVisible();
  });

  test('10,000-student tenant renders only the bounded 50-row page', async ({ page }) => {
    const pageRows = Array.from({ length: 50 }, (_, index) => ({
      ...mockStudent,
      id: `${index}`.padStart(8, '0') + '-cccc-cccc-cccc-cccccccccccc',
      first_name: `Student${index}`,
    }));
    await installAdminStudentMock(page, { students: pageRows, totalCount: 10000 });
    await page.goto('/admin/students');
    await expect(page.locator('tbody tr')).toHaveCount(50);
    await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-50 of 10000');
  });

  test('logged-out user is blocked from student roster page', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({
      timeout: 15000,
    });
  });
});
