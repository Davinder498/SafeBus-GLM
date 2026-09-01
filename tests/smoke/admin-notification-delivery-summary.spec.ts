import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const ids = { profile: '11111111-1111-1111-1111-111111111111', tenant: '22222222-2222-2222-2222-222222222222' };
function profile(role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin') {
  return { id: ids.profile, tenant_id: ids.tenant, school_id: null, full_name: 'Test Admin', email: 'admin@example.test', role, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

async function mockRole(page: Page, role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin', summaryBody?: unknown) {
  const currentProfile = profile(role);
  await page.addInitScript(({ userProfile }) => {
    const session = { access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ', 'smoke-test-signature'].join('.'), refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userProfile.id, email: userProfile.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: userProfile.created_at } };
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
    if (path.includes('/rpc/get_admin_trip_overview')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (path.includes('/rpc/get_notification_delivery_health_v2')) {
      if (summaryBody === undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: { pending: 2, retrying: 1, failed: 1, oldestPendingAt: '2026-01-01T00:00:00Z' }, push: { pending: 3, retrying: 2, failed: 1, oldestPendingAt: '2026-01-01T00:00:00Z', invalidDevices: 4, recentFailureCategories: [{ category: 'temporary_provider_error', count: 1 }] } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summaryBody) });
    }
    const rows: Record<string, unknown[]> = {
      driver_trips: [], driver_route_assignments: [], buses: [], drivers: [], routes: [], schools: [],
    };
    const table = path.split('/').pop() ?? '';
    if (table === 'get_admin_dashboard_overview') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routes: [] }) });
    if (table in rows) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[table]) });
    return blockUnexpectedSupabaseRestAccess(route, method, path);
  });
}

test.describe('Phase 15B tenant admin notification delivery summary', () => {
  test('tenant admin sees safe operational counts and failure categories', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Notification delivery', level: 2 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guardian email' }).getByText('Pending', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guardian email' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
    // Failure category labels
    await expect(page.getByText(/Temporary provider error/)).toBeVisible();
    await expect(page.getByText(/Invalid\/stale devices: 4/)).toBeVisible();
  });

  test('summary does not expose recipient email or student personal information', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.goto('/admin/trips');
    // The summary card must never show emails or names
    await expect(page.getByRole('heading', { name: 'Notification delivery' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
    const cardText = await page.locator('h2:has-text("Notification delivery")').locator('..').textContent();
    expect(cardText).not.toContain('@');
    expect(cardText).not.toContain('guardian@example');
    expect(cardText).toContain('no recipient');
  });

  test('guardian cannot access admin trips page', async ({ page }) => {
    await mockRole(page, 'guardian');
    await page.goto('/admin/trips');
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('driver cannot access admin trips page', async ({ page }) => {
    await mockRole(page, 'driver');
    await page.goto('/admin/trips');
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('Platform Super Admin cannot access tenant admin trips page', async ({ page }) => {
    await mockRole(page, 'platform_super_admin');
    await page.goto('/admin/trips');
    // Platform Super Admin is redirected away from tenant admin pages
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('summary card renders without crashing on mobile viewport', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Notification delivery', level: 2 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guardian email' }).getByText('Pending', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
  });

  test('handles empty summary gracefully', async ({ page }) => {
    await mockRole(page, 'tenant_admin', { email: { pending: 0, retrying: 0, failed: 0, oldestPendingAt: null }, push: { pending: 0, retrying: 0, failed: 0, oldestPendingAt: null, invalidDevices: 0, recentFailureCategories: [] } });
    await page.goto('/admin/trips');
    await expect(page.getByText('No recent push failures.')).toBeVisible();
  });

  test('fails closed when the delivery-health response is malformed', async ({ page }) => {
    await mockRole(page, 'tenant_admin', []);
    await page.goto('/admin/trips');
    await expect(page.getByText('Summary unavailable')).toBeVisible();
  });
});
