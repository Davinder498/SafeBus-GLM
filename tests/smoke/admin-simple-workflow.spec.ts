import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const ids = { profile: '11111111-1111-1111-1111-111111111111', tenant: '22222222-2222-2222-2222-222222222222', driver: '33333333-3333-3333-3333-333333333333', bus: '44444444-4444-4444-4444-444444444444', route: '55555555-5555-5555-5555-555555555555', assignment: '66666666-6666-6666-6666-666666666666', trip: '77777777-7777-7777-7777-777777777777' };
function profile(role: 'tenant_admin' | 'guardian' = 'tenant_admin') { return { id: ids.profile, tenant_id: ids.tenant, school_id: null, full_name: 'Test Admin', email: 'admin@example.test', role, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }; }

async function mockAdmin(page: Page, role: 'tenant_admin' | 'guardian' = 'tenant_admin') {
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
    const rows: Record<string, unknown[]> = {
      driver_trips: [{ id: ids.trip, tenant_id: ids.tenant, driver_id: ids.driver, bus_id: ids.bus, route_id: ids.route, trip_type: 'morning', status: 'active', service_date: '2026-01-01', started_at: '2026-01-01T08:00:00Z', ended_at: null, created_at: '2026-01-01T08:00:00Z', updated_at: '2026-01-01T08:00:00Z' }],
      driver_route_assignments: [{ id: ids.assignment, tenant_id: ids.tenant, driver_id: ids.driver, bus_id: ids.bus, route_id: ids.route, trip_type: 'morning', status: 'active', effective_from: null, effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      buses: [{ id: ids.bus, tenant_id: ids.tenant, school_id: null, bus_number: 'One', license_plate: null, capacity: 40, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      drivers: [{ id: ids.driver, tenant_id: ids.tenant, profile_id: ids.profile, employee_number: 'D1', phone: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      routes: [{ id: ids.route, tenant_id: ids.tenant, school_id: null, route_name: 'Route One', route_code: 'R1', route_type: 'morning', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
    };
    const table = path.split('/').pop() ?? '';
    if (table in rows) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[table]) });
    return blockUnexpectedSupabaseRestAccess(route, method, path);
  });
}

test.describe('Phase 12 simple admin workflow', () => {
  test('uses five task-oriented primary navigation choices', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/setup'); for (const label of ['Overview', 'Setup', 'Operations', 'People', 'More']) await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Stops', exact: true })).toHaveCount(0); });
  test('setup treats stops as part of routes, not a separate step', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/setup'); await expect(page.getByRole('heading', { name: 'Transportation setup', level: 1 })).toBeVisible(); await expect(page.getByTestId('admin-setup-progress')).toContainText('0 of 8 steps complete'); await expect(page.getByTestId('admin-setup-progress')).toContainText('Next step: Buses'); await expect(page.getByRole('heading', { name: 'Routes and stops', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Stops', exact: true })).toHaveCount(0); });
  test('trips page shows driver-created readiness and active trip', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/trips'); await expect(page.getByRole('heading', { name: 'Trips', level: 1 })).toBeVisible(); await expect(page.getByText('Drivers start trips from active assignments')).toBeVisible(); await expect(page.getByText('Ready for driver')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Route One · Bus One' })).toBeVisible(); });
  test('guardian cannot access task-oriented admin pages', async ({ page }) => { await mockAdmin(page, 'guardian'); await page.goto('/admin/setup'); await expect(page.getByText('Wrong portal')).toBeVisible(); });
});
