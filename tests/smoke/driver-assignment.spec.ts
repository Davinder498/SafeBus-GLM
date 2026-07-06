import { test, expect, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

/**
 * Milestone 4F — Driver Assignment Foundation smoke tests.
 *
 * Coverage:
 *   1. Admin assignment page renders
 *   2. Admin can create assignment
 *   3. Driver no assignments empty state
 *   4. Raw backend error safely handled on trip start
 *
 * Uses the mocked Supabase layer (no production credentials, no backdoors).
 */

// --- Admin mock for assignment page tests ---

const ADMIN_PROFILE = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenant_id: MOCK.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const adminDriverRow = {
  id: MOCK.driverId,
  tenant_id: MOCK.tenantId,
  profile_id: MOCK.profileId,
  employee_number: 'DRV-001',
  phone: null,
  status: 'active',
};

async function installAdminAssignmentMock(page: Page) {
  let assignments: Record<string, unknown>[] = [];

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.includes('placeholder.supabase.co')) {
      await route.fallback();
      return;
    }
    const method = route.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ id: ADMIN_PROFILE.id, aud: 'authenticated', role: 'authenticated', email: ADMIN_PROFILE.email, app_metadata: {}, user_metadata: {}, created_at: ADMIN_PROFILE.created_at }),
        });
        return;
      }
      if (path.endsWith('/token')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, user: { id: ADMIN_PROFILE.id, email: ADMIN_PROFILE.email, aud: 'authenticated', role: 'authenticated' } }) });
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
        if (path.includes('/profiles')) { await fulfillRows([ADMIN_PROFILE]); return; }
        if (path.includes('/drivers')) { await fulfillRows([adminDriverRow]); return; }
        if (path.includes('/buses')) {
          await fulfillRows([{ id: MOCK.busId, tenant_id: MOCK.tenantId, school_id: null, bus_number: '42', license_plate: 'SB-42', capacity: 48, status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' }]);
          return;
        }
        if (path.includes('/routes')) {
          await fulfillRows([{ id: MOCK.routeId, tenant_id: MOCK.tenantId, school_id: null, route_name: 'Riverside AM', route_code: 'RIV-AM', route_type: 'morning', status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' }]);
          return;
        }
        if (path.includes('/driver_route_assignments')) { await fulfillRows(assignments); return; }
        await fulfillRows([]);
        return;
      }
      if (method === 'POST' && path.includes('/driver_route_assignments')) {
        const newAssignment = {
          id: MOCK.assignmentId, tenant_id: MOCK.tenantId, driver_id: MOCK.driverId,
          bus_id: MOCK.busId, route_id: MOCK.routeId, trip_type: 'morning', status: 'active',
          effective_from: null, effective_to: null, created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
        };
        assignments = [newAssignment];
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newAssignment) });
        return;
      }
      await route.fallback();
      return;
    }
    await route.fallback();
  });

  await page.addInitScript(() => {
    const s = { access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'admin@smoke-test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00.000Z' } };
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-localhost-auth-token']) { try { window.localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Milestone 4F — Admin driver assignments', () => {
  test('admin assignment page renders with title and Add button', async ({ page }) => {
    await installAdminAssignmentMock(page);
    await page.goto('/admin/driver-assignments');

    await expect(page.getByRole('heading', { name: 'Driver assignments', level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Add assignment' })).toBeVisible();
  });

  test('admin can create an assignment', async ({ page }) => {
    await installAdminAssignmentMock(page);
    await page.goto('/admin/driver-assignments');

    // Wait for the page to load.
    await expect(page.getByRole('heading', { name: 'Driver assignments', level: 1 })).toBeVisible({ timeout: 10000 });

    // Open the add-assignment form.
    await page.getByRole('button', { name: 'Add assignment' }).click();

    // Select driver, bus, route, trip type.
    await page.getByLabel('Driver').selectOption({ index: 1 });
    await page.getByLabel('Bus').selectOption({ index: 1 });
    await page.getByLabel('Route').selectOption({ index: 1 });

    // Save.
    await page.getByRole('button', { name: 'Save assignment' }).click();

    // Success message appears.
    await expect(page.getByText('Assignment created.')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Milestone 4F — Driver assignment workflow', () => {
  test('driver with no assignments sees empty state', async ({ page }) => {
    // No withAssignments → mock returns [] for driver_route_assignments.
    await installSupabaseMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No active trip assignments.')).toBeVisible();
    await expect(page.getByText('Please contact your transportation admin.')).toBeVisible();

    // No free bus/route dropdowns appear.
    await expect(page.getByLabel('Bus')).toHaveCount(0);
    await expect(page.getByLabel('Route')).toHaveCount(0);
  });

  test('raw backend error on trip start is safely handled', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });

    // Override the start_driver_trip_from_assignment RPC to return a raw
    // backend-like error. This route is registered AFTER installSupabaseMock,
    // so it runs first (Playwright matches routes in reverse registration order).
    const rawError = 'permission denied for function start_driver_trip_from_assignment';
    await page.route('**/rpc/start_driver_trip_from_assignment', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: rawError }),
      });
    });

    await page.goto('/driver');

    // Wait for the assignment card.
    await expect(page.getByTestId('driver-assignment-card')).toBeVisible({ timeout: 10000 });

    // Click Start Trip.
    await page.getByTestId('driver-assignment-start-button').click();

    // Generic safe error appears (case-insensitive match).
    await expect(page.getByText(/could not start/i)).toBeVisible({ timeout: 10000 });

    // Raw backend error text does NOT appear.
    await expect(page.getByText(rawError)).toHaveCount(0);
  });
});
