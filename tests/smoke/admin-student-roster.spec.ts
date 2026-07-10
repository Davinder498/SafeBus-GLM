import { test, expect, type Page, type Route } from '@playwright/test';

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
  school_student_number: null,
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

async function installAdminStudentMock(page: Page, opts: { students?: typeof mockStudent[] } = {}) {
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
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ id: adminProfile.id, aud: 'authenticated', role: 'authenticated', email: adminProfile.email, app_metadata: {}, user_metadata: {}, created_at: adminProfile.created_at }),
        });
        return;
      }
      if (path.endsWith('/token')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, user: { id: adminProfile.id, email: adminProfile.email, aud: 'authenticated', role: 'authenticated' } }) });
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
          if (rows.length === 0) { await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ message: 'no rows' }) }); return; }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0]) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      };

      if (method === 'GET') {
        if (path.includes('/profiles')) { await fulfillRows([adminProfile]); return; }
        if (path.includes('/students')) { await fulfillRows(students); return; }
        if (path.includes('/schools')) { await fulfillRows([]); return; }
        await fulfillRows([]);
        return;
      }
      if (method === 'POST' && path.includes('/students')) {
        const newStudent = { ...mockStudent, first_name: 'New', last_name: 'Student' };
        students = [newStudent];
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newStudent) });
        return;
      }
      await route.fallback();
      return;
    }
    await route.fallback();
  });

  await page.addInitScript(() => {
    const s = { access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'admin@smoke-test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00.000Z' } };
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) { try { window.localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }
  });
}

test.describe('Milestone 5A.1 — Admin student roster', () => {
  test('page renders with title and Add student button', async ({ page }) => {
    await installAdminStudentMock(page);
    await page.goto('/admin/students');

    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Add student' })).toBeVisible();
  });

  test('admin can create a student', async ({ page }) => {
    await installAdminStudentMock(page);
    await page.goto('/admin/students');

    // Wait for the page to load.
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible({ timeout: 10000 });

    // Open the add-student form.
    await page.getByRole('button', { name: 'Add student' }).click();

    // Fill in first and last name.
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('Student');

    // Save.
    await page.getByRole('button', { name: 'Save student' }).click();

    // Success message appears.
    await expect(page.getByText('Student created.')).toBeVisible({ timeout: 10000 });
  });

  test('logged-out user is blocked from student roster page', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({ timeout: 15000 });
  });
});
