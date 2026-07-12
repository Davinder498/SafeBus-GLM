import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const ids = { profile: '11111111-1111-1111-1111-111111111111', tenant: '22222222-2222-2222-2222-222222222222', driver: '33333333-3333-3333-3333-333333333333', bus: '44444444-4444-4444-4444-444444444444', route: '55555555-5555-5555-5555-555555555555', assignment: '66666666-6666-6666-6666-666666666666', trip: '77777777-7777-7777-7777-777777777777' };
function profile(role: 'tenant_admin' | 'guardian' = 'tenant_admin') { return { id: ids.profile, tenant_id: ids.tenant, school_id: null, full_name: 'Test Admin', email: 'admin@example.test', role, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }; }

interface MockAdminOptions {
  /** When true, the driver_route_assignments GET returns a 500 to simulate a
   * failing enrichment query. Used to assert routes still render. */
  failAssignments?: boolean;
}

async function mockAdmin(
  page: Page,
  role: 'tenant_admin' | 'guardian' = 'tenant_admin',
  opts: MockAdminOptions = {},
) {
  const currentProfile = profile(role);
  await page.addInitScript(({ userProfile }) => {
    const session = { access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userProfile.id, email: userProfile.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: userProfile.created_at } };
    for (const key of ['supabase.auth.token', 'sb-placeholder-auth-token', 'sb-bppmqykkbhrmotcybxrh-auth-token', 'sb-localhost-auth-token']) window.localStorage.setItem(key, JSON.stringify(session));
  }, { userProfile: currentProfile });
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return route.fallback();
    const path = url.pathname; const method = route.request().method();
    if (path.startsWith('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/user') ? { id: currentProfile.id, email: currentProfile.email, role: 'authenticated', aud: 'authenticated' } : {}) });
    if (!path.startsWith('/rest/v1/')) return route.fallback();
    if (path.includes('/profiles')) { const single = (route.request().headers().accept ?? '').includes('object+json'); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? currentProfile : [currentProfile]) }); }
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
    if (path.includes('/rpc/get_admin_live_fleet_monitoring')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    // Simulate a failing enrichment query to prove routes render independently.
    if (opts.failAssignments && path.includes('/driver_route_assignments')) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'simulated enrichment failure' }) });
    }
    const rows: Record<string, unknown[]> = {
      driver_trips: [{ id: ids.trip, tenant_id: ids.tenant, driver_id: ids.driver, bus_id: ids.bus, route_id: ids.route, trip_type: 'morning', status: 'active', service_date: '2026-01-01', started_at: '2026-01-01T08:00:00Z', ended_at: null, created_at: '2026-01-01T08:00:00Z', updated_at: '2026-01-01T08:00:00Z' }],
      driver_route_assignments: [{ id: ids.assignment, tenant_id: ids.tenant, driver_id: ids.driver, bus_id: ids.bus, route_id: ids.route, trip_type: 'morning', status: 'active', effective_from: null, effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      buses: [{ id: ids.bus, tenant_id: ids.tenant, school_id: null, bus_number: 'One', license_plate: null, capacity: 40, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      drivers: [{ id: ids.driver, tenant_id: ids.tenant, profile_id: ids.profile, employee_number: 'D1', phone: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      routes: [{ id: ids.route, tenant_id: ids.tenant, school_id: null, route_name: 'Route One', route_code: 'R1', route_type: 'morning', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      route_stops: [],
      schools: [],
    };
    const table = path.split('/').pop() ?? '';
    if (table in rows) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[table]) });
    return blockUnexpectedSupabaseRestAccess(route, method, path);
  });
}

test.describe('Phase 12 simple admin workflow', () => {
  test('uses direct task-oriented primary navigation choices', async ({ page }) => {
    await mockAdmin(page);
    await page.goto('/admin/routes');
    for (const label of ['Overview', 'Students', 'Guardians', 'Drivers', 'Buses', 'Routes', 'Live'])
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    // Removed hub pages should not appear in nav
    for (const label of ['Setup', 'Operations', 'People', 'More', 'Stops'])
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  });

  test('overview shows routes with status and map toggle', async ({ page }) => {
    await mockAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Transportation overview', level: 1 })).toBeVisible();
    // Route status tile is visible
    await expect(page.getByTestId('admin-route-status-tile')).toBeVisible();
    await expect(page.getByText('Route One')).toBeVisible();
    // Toggle to view all routes on map
    await expect(page.getByTestId('admin-overview-toggle-all-routes')).toBeVisible();
  });

  test('old hub URLs redirect to overview', async ({ page }) => {
    await mockAdmin(page);
    await page.goto('/admin/setup');
    await expect(page).toHaveURL('/admin');
    await page.goto('/admin/operations');
    await expect(page).toHaveURL('/admin');
    await page.goto('/admin/people');
    await expect(page).toHaveURL('/admin');
    await page.goto('/admin/more');
    await expect(page).toHaveURL('/admin');
    await page.goto('/admin/stops');
    await expect(page).toHaveURL('/admin/routes');
  });

  test('trips page shows driver-created readiness and active trip', async ({ page }) => {
    await mockAdmin(page);
    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Trips', level: 1 })).toBeVisible();
    await expect(page.getByText('Drivers start trips from active assignments')).toBeVisible();
    await expect(page.getByText('Ready for driver')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Route One · Bus One' })).toBeVisible();
  });

  test('guardian cannot access task-oriented admin pages', async ({ page }) => {
    await mockAdmin(page, 'guardian');
    await page.goto('/admin/routes');
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('routes page still renders routes when an enrichment query fails', async ({ page }) => {
    // Regression: previously the routes page used Promise.all across 7 fetches,
    // so a single failing enrichment query (e.g. assignments) hid every route
    // behind "Unable to load routes". Routes must render independently.
    await mockAdmin(page, 'tenant_admin', { failAssignments: true });
    await page.goto('/admin/routes');
    // The route must be visible — not the error state.
    await expect(page.getByText('Route One')).toBeVisible();
    await expect(page.getByText('Unable to load routes')).toHaveCount(0);
  });
});
