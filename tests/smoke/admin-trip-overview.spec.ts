import { expect, test, type Page, type Route } from '@playwright/test';

const profile = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: '22222222-2222-2222-2222-222222222222',
  school_id: null,
  full_name: 'Trip Admin',
  email: 'admin@example.test',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const tripRows = [
  {
    trip_id: '1',
    service_date: '2026-07-25',
    status: 'active',
    started_at: '2026-07-25T08:00:00Z',
    ended_at: null,
    route_name: 'Prairie Route',
    route_code: 'PR-1',
    trip_pattern_name: 'School bound',
    direction: 'forward',
    bus_label: 'Bus 12',
    driver_label: 'Alex Driver',
  },
  {
    trip_id: '2',
    service_date: '2026-07-24',
    status: 'completed',
    started_at: '2026-07-24T15:00:00Z',
    ended_at: '2026-07-24T16:00:00Z',
    route_name: 'Prairie Route',
    route_code: 'PR-1',
    trip_pattern_name: 'Home bound',
    direction: 'reverse',
    bus_label: 'Bus 12',
    driver_label: 'Alex Driver',
  },
  {
    trip_id: '3',
    service_date: '2026-07-23',
    status: 'cancelled',
    started_at: '2026-07-23T08:00:00Z',
    ended_at: '2026-07-23T08:05:00Z',
    route_name: 'Lake Route',
    route_code: 'LR-2',
    trip_pattern_name: 'School bound',
    direction: 'forward',
    bus_label: 'Bus 8',
    driver_label: 'Sam Driver',
  },
];

async function mockAdmin(page: Page, rows: unknown[]) {
  await page.addInitScript(
    ({ userProfile }) => {
      const session = {
        access_token: 'test',
        refresh_token: 'test',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userProfile.id,
          email: userProfile.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: userProfile.created_at,
        },
      };
      for (const key of ['supabase.auth.token', 'sb-bppmqykkbhrmotcybxrh-auth-token'])
        localStorage.setItem(key, JSON.stringify(session));
    },
    { userProfile: profile },
  );
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) return route.fallback();
    if (url.pathname.startsWith('/auth/v1/'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.pathname.endsWith('/user')
            ? { id: profile.id, email: profile.email, role: 'authenticated', aud: 'authenticated' }
            : {},
        ),
      });
    if (url.pathname.includes('/profiles'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
    if (url.pathname.includes('/rpc/get_admin_trip_overview'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
      headers: { 'content-range': '0-0/0' },
    });
  });
}

test('trip history renders canonical statuses, configured directions, timestamps, and category filters', async ({
  page,
}) => {
  await mockAdmin(page, tripRows);
  await page.goto('/admin/trips');
  const overview = page.getByTestId('admin-trips-overview');
  await expect(overview).toContainText('Active1');
  await expect(overview).toContainText('Non-active2');
  await expect(overview).toContainText('Completed1');
  await expect(overview).toContainText('Cancelled1');
  await expect(overview).toContainText('Outbound');
  await expect(overview).toContainText('Return');
  await expect(overview).toContainText('In progress');
  await page.getByRole('button', { name: 'Non-active' }).click();
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cancelled' }).click();
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('admin-trips-table')).toContainText('8:05');
});

test('trip history has an accessible empty state', async ({ page }) => {
  await mockAdmin(page, []);
  await page.goto('/admin/trips');
  await expect(page.getByTestId('admin-trips-empty')).toContainText('No trips');
});
