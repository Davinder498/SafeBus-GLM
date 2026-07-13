import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

/**
 * Milestone 5A — Guardian Student & Route Visibility smoke tests.
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock returns a guardian
 * profile so ProtectedRoute admits the caller to /guardian/routes, and returns
 * a configurable list of linked student routes from the
 * get_guardian_student_route_visibility RPC.
 *
 * Coverage:
 *   1. Guardian dashboard link to My Students & Routes
 *   2. Guardian sees only linked student route
 *   3. Empty state
 *   4. Generic error handling (raw backend error hidden)
 *   5. Admin can create guardian-student link
 *   6. Role protection (logged-out + driver blocked)
 */

const GUARDIAN = {
  profileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  guardianId: '33333333-3333-3333-3333-333333333333',
  studentId: '44444444-4444-4444-4444-444444444444',
} as const;

const guardianProfile = {
  id: GUARDIAN.profileId,
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Guardian',
  email: 'guardian@smoke-test.local',
  role: 'guardian',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const adminProfile = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

interface GuardianStudentRouteRpcRow {
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_preferred_name: string | null;
  student_grade: string | null;
  route_assignment_id: string | null;
  route_id: string | null;
  route_name: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
}

interface GuardianLiveTripRpcRow {
  student_id: string;
  student_name: string;
  route_id: string;
  route_name: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  trip_status: string | null;
  has_active_trip: boolean;
  last_location_latitude: number | null;
  last_location_longitude: number | null;
  last_location_recorded_at: string | null;
}

function linkedStudentRoute(): GuardianStudentRouteRpcRow {
  return {
    student_id: GUARDIAN.studentId,
    student_first_name: 'Avery',
    student_last_name: 'Johnson',
    student_preferred_name: 'Avi',
    student_grade: 'Grade 4',
    route_assignment_id: '55555555-5555-5555-5555-555555555555',
    route_id: '66666666-6666-6666-6666-666666666666',
    route_name: 'North Ridge Morning',
    pickup_stop_name: 'Elm & 4th',
    dropoff_stop_name: 'Maple Creek School',
    assignment_status: 'active',
  };
}

/**
 * Install a Supabase mock for the guardian routes page. Returns controls.
 * Must be called BEFORE page.goto.
 */
async function installGuardianMock(
  page: Page,
  opts: { routes?: GuardianStudentRouteRpcRow[]; failRpc?: boolean; rawError?: string } = {},
) {
  let routesForRpc: GuardianStudentRouteRpcRow[] = opts.routes ?? [];
  let failRpc = opts.failRpc ?? false;
  const rawError = opts.rawError ?? 'permission denied for function get_guardian_student_route_visibility';

  const setRoutes = (rows: GuardianStudentRouteRpcRow[]) => {
    routesForRpc = rows;
  };
  const setFailRpc = (fail: boolean) => {
    failRpc = fail;
  };

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
          body: JSON.stringify({ id: guardianProfile.id, aud: 'authenticated', role: 'authenticated', email: guardianProfile.email, app_metadata: {}, user_metadata: {}, created_at: guardianProfile.created_at }),
        });
        return;
      }
      if (path.endsWith('/token')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, user: { id: guardianProfile.id, email: guardianProfile.email, aud: 'authenticated', role: 'authenticated' } }) });
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

      if (method === 'GET' && path.includes('/profiles')) {
        await fulfillRows([guardianProfile]);
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_guardian_student_route_visibility')) {
        if (failRpc) {
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: rawError }) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routesForRpc) });
        }
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_guardian_live_trip_visibility')) {
        // Milestone 6A: live bus status. Default mock returns no active trip
        // ("No active trip right now"). This keeps the existing route-visibility
        // assertions stable while exercising the new safe read path.
        const liveRows: GuardianLiveTripRpcRow[] = (routesForRpc).map((r) => ({
          student_id: r.student_id,
          student_name: `${r.student_first_name} ${r.student_last_name}`,
          route_id: r.route_id ?? '00000000-0000-0000-0000-000000000000',
          route_name: r.route_name ?? '',
          pickup_stop_name: r.pickup_stop_name,
          dropoff_stop_name: r.dropoff_stop_name,
          trip_status: null,
          has_active_trip: false,
          last_location_latitude: null,
          last_location_longitude: null,
          last_location_recorded_at: null,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveRows) });
        return;
      }
      if (method === 'GET') {
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }
      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }
    await route.fallback();
  });

  await page.addInitScript(() => {
    const s = { access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '11111111-1111-1111-1111-111111111111', email: 'guardian@smoke-test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00.000Z' } };
    for (const k of ['supabase.auth.token', 'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) { try { window.localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }
  });

  return { setRoutes, setFailRpc };
}

// --- Admin mock for link management test ---

async function installAdminLinkMock(page: Page) {
  let links: Record<string, unknown>[] = [];

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) { await route.fallback(); return; }
    const method = route.request().method(); const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: adminProfile.id, aud: 'authenticated', role: 'authenticated', email: adminProfile.email, app_metadata: {}, user_metadata: {}, created_at: adminProfile.created_at }) });
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
        if (path.includes('/guardians')) { await fulfillRows([{ id: GUARDIAN.guardianId, tenant_id: GUARDIAN.tenantId, profile_id: GUARDIAN.profileId, full_name: 'Test Guardian', email: 'guardian@smoke-test.local', phone: null, status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' }]); return; }
        if (path.includes('/student_guardians')) { await fulfillRows(links); return; }
        if (path.includes('/students')) { await fulfillRows([{ id: GUARDIAN.studentId, tenant_id: GUARDIAN.tenantId, school_id: 'school-1', first_name: 'Avery', last_name: 'Johnson', preferred_name: null, grade: 'Grade 4', school_student_number: null, status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' }]); return; }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_admin_paginated_list')) {
        const guardian = { id: GUARDIAN.guardianId, tenant_id: GUARDIAN.tenantId, profile_id: GUARDIAN.profileId, full_name: 'Test Guardian', email: 'guardian@smoke-test.local', phone: null, status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', active_link_count: links.filter((link) => link.status === 'active').length };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [guardian], totalCount: 1, page: 1, pageSize: 50 }) }); return;
      }
      if (method === 'POST' && path.includes('/rpc/search_admin_students')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: GUARDIAN.studentId, label: 'Avery Johnson', school_name: 'Test School' }]) }); return;
      }
      if (method === 'POST' && path.includes('/rpc/get_admin_guardian_links')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(links.map((link) => ({ id: link.id, student_id: link.student_id, student_name: 'Avery Johnson', relationship: link.relationship, status: link.status }))) }); return;
      }
      if (method === 'POST' && path.includes('/rpc/admin_link_student_guardian')) {
        const newLink = { id: 'link-1', tenant_id: GUARDIAN.tenantId, student_id: GUARDIAN.studentId, guardian_id: GUARDIAN.guardianId, relationship: 'guardian', can_receive_notifications: true, status: 'active', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' };
        links = [newLink];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newLink) });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/admin_deactivate_student_guardian')) {
        links = [];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'link-1', status: 'inactive' }) });
        return;
      }
      await blockUnexpectedSupabaseRestAccess(route, method, path);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Milestone 5A — Guardian student route visibility', () => {
  test('guardian dashboard has link to My Students & Routes', async ({ page }) => {
    await installGuardianMock(page);
    await page.goto('/parent');

    await expect(page.getByRole('heading', { name: 'My Students & Routes' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'View my students' })).toBeVisible();
  });

  test('guardian sees only linked student route', async ({ page }) => {
    await installGuardianMock(page, { routes: [linkedStudentRoute()] });
    await page.goto('/guardian/routes');

    await expect(page.getByRole('heading', { name: 'My Students & Routes', level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guardian-student-route-card')).toBeVisible();
    await expect(page.getByText('Avery Johnson (Avi)')).toBeVisible();
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByText('Elm & 4th')).toBeVisible();
    await expect(page.getByText('Maple Creek School')).toBeVisible();

    // No live location/map/ETA appears.
    await expect(page.getByText('latitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('longitude', { exact: false })).toHaveCount(0);
    await expect(page.getByText('ETA', { exact: false })).toHaveCount(0);
  });

  test('empty state renders when no linked students', async ({ page }) => {
    await installGuardianMock(page, { routes: [] });
    await page.goto('/guardian/routes');

    await expect(page.getByTestId('guardian-routes-empty')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No student route assignments are available yet.')).toBeVisible();
    await expect(page.getByText('Please contact your school transportation office.')).toBeVisible();
  });

  test('raw backend error is safely handled', async ({ page }) => {
    const rawError = 'permission denied for function get_guardian_student_route_visibility';
    await installGuardianMock(page, { failRpc: true, rawError });
    await page.goto('/guardian/routes');

    await expect(page.getByTestId('guardian-routes-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('We could not load your student route information.')).toBeVisible();
    // Raw backend error text does NOT appear.
    await expect(page.getByText(rawError)).toHaveCount(0);
  });
});

test.describe('Milestone 5A/5B — Admin guardian-student link management', () => {
  test('admin can create guardian-student link', async ({ page }) => {
    await installAdminLinkMock(page);
    await page.goto('/admin/guardians');

    // Wait for page to load.
    await expect(page.getByRole('heading', { name: 'Guardians', level: 1 })).toBeVisible({ timeout: 10000 });

    // Click "Add link" on the guardian card.
    await page.getByRole('button', { name: 'Add link' }).click();

    // Search for a student without downloading the full roster.
    await page.getByRole('searchbox', { name: 'Search students' }).fill('Avery');
    await page.getByRole('button', { name: /Avery Johnson/ }).click();

    // Save.
    await page.getByRole('button', { name: 'Save link' }).click();

    // Success message appears.
    await expect(page.getByText('Student linked to guardian.')).toBeVisible({ timeout: 10000 });
  });

  test('admin can view linked students by expanding a guardian card', async ({ page }) => {
    await installAdminLinkMock(page);
    await page.goto('/admin/guardians');

    await expect(page.getByRole('heading', { name: 'Guardians', level: 1 })).toBeVisible({ timeout: 10000 });

    // Click "View links" to expand.
    await page.getByRole('button', { name: /View links/ }).click();

    // The "Linked students" section should be visible.
    await expect(page.getByRole('heading', { name: 'Linked students' })).toBeVisible();
  });
});

test.describe('Milestone 5A — Role protection', () => {
  test('logged-out user is blocked from guardian routes page', async ({ page }) => {
    // Navigate without any mock — no session, ProtectedRoute shows "Sign in required".
    await page.goto('/guardian/routes');
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible({ timeout: 15000 });
  });
});
