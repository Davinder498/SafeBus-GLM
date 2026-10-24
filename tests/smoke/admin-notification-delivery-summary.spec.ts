import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';
import { installLocalOnlyBoundary } from './fixtures/local-only';
import { expectUsableMobileLayout } from './fixtures/responsive';

const ids = {
  profile: '11111111-1111-1111-1111-111111111111',
  tenant: '22222222-2222-2222-2222-222222222222',
};
function profile(
  role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin',
) {
  return {
    id: ids.profile,
    tenant_id: ids.tenant,
    school_id: null,
    full_name: 'Test Admin',
    email: 'admin@example.test',
    role,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

async function mockRole(
  page: Page,
  role: 'tenant_admin' | 'guardian' | 'driver' | 'platform_super_admin' = 'tenant_admin',
  summaryBody?: unknown,
  settingsOverrides: Record<string, unknown> = {},
) {
  await installLocalOnlyBoundary(page);
  const currentProfile = profile(role);
  const settings = {
    notifications_enabled: true,
    push_notifications_enabled: true,
    email_effective: true,
    push_effective: true,
    privacy_review_status: 'approved',
    privacy_approved_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...settingsOverrides,
  };
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.addInitScript(
    ({ userProfile }) => {
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
          id: userProfile.id,
          email: userProfile.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: userProfile.created_at,
        },
      };
      for (const key of [
        'supabase.auth.token',
        'sb-placeholder-auth-token',
        'sb-bppmqykkbhrmotcybxrh-auth-token',
        'sb-localhost-auth-token',
      ])
        window.localStorage.setItem(key, JSON.stringify(session));
    },
    { userProfile: currentProfile },
  );
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return route.fallback();
    const path = url.pathname;
    const method = route.request().method();
    if (path.startsWith('/auth/v1/'))
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
    if (!path.startsWith('/rest/v1/')) return route.fallback();
    if (path.includes('/profiles')) {
      const single = (route.request().headers().accept ?? '').includes('object+json');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? currentProfile : [currentProfile]),
      });
    }
    if (method === 'HEAD')
      return route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
    if (path.includes('/rpc/get_user_notification_unread_count'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '0' });
    if (path.includes('/rpc/get_user_notifications'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (path.includes('/rpc/get_admin_live_fleet_monitoring'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (path.includes('/rpc/get_admin_trip_overview'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (path.includes('/rpc/get_tenant_notification_settings'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings),
      });
    if (
      path.includes('/rpc/set_tenant_notification_delivery_enabled') ||
      path.includes('/rpc/set_tenant_push_notifications_enabled')
    ) {
      const body = route.request().postDataJSON();
      mutations.push({ path, body });
      if (path.includes('set_tenant_notification_delivery_enabled')) {
        settings.notifications_enabled = body.p_enabled;
        settings.email_effective = body.p_enabled;
      } else settings.push_notifications_enabled = body.p_enabled;
      settings.push_effective =
        settings.notifications_enabled && settings.push_notifications_enabled;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings),
      });
    }
    if (path.includes('/rpc/get_notification_delivery_health_v2')) {
      if (summaryBody === undefined)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            email: { pending: 2, retrying: 1, failed: 1, oldestPendingAt: '2026-01-01T00:00:00Z' },
            push: {
              pending: 3,
              retrying: 2,
              failed: 1,
              oldestPendingAt: '2026-01-01T00:00:00Z',
              invalidDevices: 4,
              recentFailureCategories: [{ category: 'temporary_provider_error', count: 1 }],
            },
          }),
        });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summaryBody),
      });
    }
    const rows: Record<string, unknown[]> = {
      driver_trips: [],
      driver_route_assignments: [],
      buses: [],
      drivers: [],
      routes: [],
      schools: [],
      tenants: [],
    };
    const table = path.split('/').pop() ?? '';
    if (table === 'get_admin_dashboard_overview')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routes: [] }),
      });
    if (table in rows)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows[table]),
      });
    return blockUnexpectedSupabaseRestAccess(route, method, path);
  });
  return mutations;
}

async function openDeliveryActivity(page: Page) {
  await page.goto('/admin/settings/notifications');
  await page.getByText('Delivery activity', { exact: true }).click();
}

test.describe('tenant admin notification delivery summary', () => {
  test('tenant inbox opens notification settings and provides a return link', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.goto('/notifications');
    const header = page.locator('[data-ui="page-header"]');
    await expect(header.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await header.getByRole('link', { name: 'Notification settings' }).click();
    await expect(page).toHaveURL(/\/admin\/settings\/notifications$/);
    await expect(
      page.getByRole('heading', { name: 'Notification settings', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to notifications' }).click();
    await expect(page).toHaveURL(/\/notifications$/);
  });

  test('tenant inbox uses scrollable filter links and a compact mark-all action', async ({
    page,
  }) => {
    await mockRole(page, 'tenant_admin');
    await page.route('**/rest/v1/rpc/get_user_notification_unread_count', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '2' }),
    );
    await page.route('**/rest/v1/rpc/mark_all_user_notifications_read', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '2' }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/notifications');

    const filters = page.locator('[data-ui="notification-filters"]');
    const scroller = filters.locator(':scope > div').first();
    await expect(filters.getByRole('combobox')).toHaveCount(0);
    await expect(filters.getByRole('checkbox')).toHaveCount(0);
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );

    const unread = filters.getByRole('button', { name: 'Unread 2' });
    await unread.click();
    await expect(unread).toHaveAttribute('aria-pressed', 'true');
    const trips = filters.getByRole('button', { name: 'Trips' });
    await trips.click();
    await expect(trips).toHaveAttribute('aria-pressed', 'true');
    await expect(unread).toHaveAttribute('aria-pressed', 'false');

    const markAllRead = filters.getByRole('button', { name: 'Mark all read' });
    await expect(markAllRead).toBeEnabled();
    const request = page.waitForRequest('**/rest/v1/rpc/mark_all_user_notifications_read');
    await markAllRead.click();
    await request;
  });

  test('settings tabs fit without horizontal scrolling and wrap on narrow screens', async ({
    page,
  }) => {
    await mockRole(page, 'tenant_admin');
    const widths = [1280, 390];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/admin/settings');
      const nav = page.getByRole('navigation', { name: 'Settings sections' });
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(3);
      await expect(nav.getByRole('link', { name: 'Schools', exact: true })).toHaveCount(0);
      await expect(nav.getByRole('link', { name: 'Notifications' })).toHaveCount(0);
      await expect(nav.getByRole('link', { name: 'School authority' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const measurements = await nav.evaluate((element) => {
        const linkBounds = Array.from(element.querySelectorAll('a'), (link) =>
          link.getBoundingClientRect(),
        );
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          rowCount: new Set(linkBounds.map((bounds) => Math.round(bounds.top))).size,
          linksFit: linkBounds.every(
            (bounds) =>
              bounds.left >= element.getBoundingClientRect().left &&
              bounds.right <= element.getBoundingClientRect().right,
          ),
        };
      });
      expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth);
      expect(measurements.linksFit).toBe(true);
      expect(measurements.rowCount).toBe(width === 1280 ? 1 : 2);
    }
  });

  test('tenant admin sees safe operational counts and failure categories', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await openDeliveryActivity(page);
    await expect(
      page.getByRole('heading', { name: 'Notification delivery', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Email' }).getByText('Pending', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
    // Failure category labels
    await expect(page.getByText(/Temporary provider error/)).toBeVisible();
    await expect(page.getByText(/Invalid\/stale devices: 4/)).toBeVisible();
  });

  test('summary does not expose recipient email or student personal information', async ({
    page,
  }) => {
    await mockRole(page, 'tenant_admin');
    await openDeliveryActivity(page);
    // The summary card must never show emails or names
    await expect(page.getByRole('heading', { name: 'Notification delivery' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
    const cardText = await page
      .locator('h2:has-text("Notification delivery")')
      .locator('..')
      .textContent();
    expect(cardText).not.toContain('@');
    expect(cardText).not.toContain('guardian@example');
    expect(cardText).not.toContain('recipient, message, token or provider identifiers');
  });

  test('guardian cannot access tenant notification settings', async ({ page }) => {
    await mockRole(page, 'guardian');
    await page.goto('/admin/settings/notifications');
    await expect(page.getByRole('heading', { name: 'Use the correct SafeBus app' })).toBeVisible();
  });

  test('driver cannot access tenant notification settings', async ({ page }) => {
    await mockRole(page, 'driver');
    await page.goto('/admin/settings/notifications');
    await expect(page.getByRole('heading', { name: 'Use the correct SafeBus app' })).toBeVisible();
  });

  test('Platform Super Admin cannot access tenant notification settings', async ({ page }) => {
    await mockRole(page, 'platform_super_admin');
    await page.goto('/admin/settings/notifications');
    // Platform Super Admin is redirected away from tenant admin pages
    await expect(page.getByText('Wrong portal')).toBeVisible();
  });

  test('summary card renders without crashing on mobile viewport', async ({ page }) => {
    await mockRole(page, 'tenant_admin');
    await page.setViewportSize({ width: 375, height: 667 });
    await openDeliveryActivity(page);
    await expect(
      page.getByRole('heading', { name: 'Notification delivery', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Email' }).getByText('Pending', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Android push' })).toBeVisible();
  });

  test('handles empty summary gracefully', async ({ page }) => {
    await mockRole(page, 'tenant_admin', {
      email: { pending: 0, retrying: 0, failed: 0, oldestPendingAt: null },
      push: {
        pending: 0,
        retrying: 0,
        failed: 0,
        oldestPendingAt: null,
        invalidDevices: 0,
        recentFailureCategories: [],
      },
    });
    await openDeliveryActivity(page);
    await expect(page.getByText('No recent push failures.')).toBeVisible();
  });

  test('fails closed when the delivery-health response is malformed', async ({ page }) => {
    await mockRole(page, 'tenant_admin', []);
    await openDeliveryActivity(page);
    await expect(page.getByText('Summary unavailable')).toBeVisible();
  });

  test('compact settings are accessible and confirm school authority changes', async ({
    page,
  }, testInfo) => {
    const mutations = await mockRole(page);
    if (testInfo.project.name === 'mobile-chromium')
      await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/admin/settings/notifications');
    const alerts = page.getByRole('switch', { name: 'Email and phone alerts', exact: true });
    const push = page.getByRole('switch', { name: 'Android push', exact: true });
    await expect(alerts).toBeChecked();
    await expect(push).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Delivery channels' })).toHaveCount(0);
    await expect(page.getByText(/privacy approval|External delivery is locked/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Notification delivery', exact: true }),
    ).not.toBeVisible();
    await expectUsableMobileLayout(page);
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(report.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('notification-settings.png'),
      fullPage: true,
    });
    await alerts.click();
    await expect(page.getByRole('dialog')).toContainText(
      'individual preferences will remain available',
    );
    expect(mutations).toHaveLength(0);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Pause alerts', exact: true })
      .click();
    await expect(alerts).not.toBeChecked();
    await expect(push).toBeChecked();
    await expect(push).toBeDisabled();
    await alerts.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Resume alerts', exact: true })
      .click();
    await expect(push).toBeEnabled();
    await push.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Disable push', exact: true })
      .click();
    await expect(push).not.toBeChecked();
    expect(mutations.map((request) => request.body)).toEqual([
      { p_enabled: false },
      { p_enabled: true },
      { p_enabled: false },
    ]);
  });

  test('unconfigured notification setup is explained without an internal approval banner', async ({
    page,
  }, testInfo) => {
    const mutations = await mockRole(page, 'tenant_admin', undefined, {
      privacy_review_status: 'pending',
      privacy_approved_at: null,
      notifications_enabled: false,
      push_notifications_enabled: false,
      email_effective: false,
      push_effective: false,
    });
    if (testInfo.project.name === 'mobile-chromium')
      await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/admin/settings/notifications');
    await expect(page.getByRole('status')).toContainText('to finish notification setup');
    await expect(page.getByRole('link', { name: 'Contact SafeBus support' })).toHaveAttribute(
      'href',
      '/admin/settings/support',
    );
    await expect(
      page.getByRole('switch', { name: 'Email and phone alerts', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Android push', exact: true })).toBeDisabled();
    await expectUsableMobileLayout(page);
    expect(mutations).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('notification-setup.png'), fullPage: true });
  });
});
