import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const ids = { profile: '11111111-1111-1111-1111-111111111111', tenant: '22222222-2222-2222-2222-222222222222' };
function profile(role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin') {
  return { id: ids.profile, tenant_id: ids.tenant, school_id: null, full_name: 'Test Admin', email: 'admin@example.test', role, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

async function mockRole(page: Page, role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin', summaryBody?: unknown) {
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
    if (path.includes('/rpc/get_tenant_notification_delivery_summary')) {
      if (summaryBody === undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ pending_count: 2, processing_count: 0, delivered_count_recent: 8, failed_count_recent: 1, cancelled_count_recent: 3, oldest_pending_age_seconds: 1800, recent_failure_categories: [{ category: 'permanent_provider_error', count: 1 }, { category: 'eligibility_revoked', count: 2 }] }]) });
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
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
    await expect(page.getByText('Delivered (24h)')).toBeVisible();
    await expect(page.getByText('Failed (24h)')).toBeVisible();
    // Failure category labels
    await expect(page.getByText(/Permanent provider error/)).toBeVisible();
    await expect(page.getByText(/Eligibility revoked/)).toBeVisible();
  });

  test('summary does not expose recipient email or student personal information', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.goto('/admin/trips');
    // The summary card must never show emails or names
    await expect(page.getByRole('heading', { name: 'Notification delivery' })).toBeVisible();
    const cardText = await page.locator('h2:has-text("Notification delivery")').locator('..').textContent();
    expect(cardText).not.toContain('@');
    expect(cardText).not.toContain('guardian@example');
    expect(cardText).not.toMatch(/recipient/i);
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
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
    await expect(page.getByText('Delivered (24h)')).toBeVisible();
  });

  test('handles empty summary gracefully', async ({ page }) => {
    await mockRole(page, 'tenant_admin', [{ pending_count: 0, processing_count: 0, delivered_count_recent: 0, failed_count_recent: 0, cancelled_count_recent: 0, oldest_pending_age_seconds: 0, recent_failure_categories: [] }]);
    await page.goto('/admin/trips');
    await expect(page.getByText('No recent delivery failures')).toBeVisible();
  });
});
