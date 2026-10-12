import { expect, test } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installMapProviderAvailable } from './fixtures/map-provider';
import { installSupabaseMock } from './fixtures/supabase-mock';
import { installLocalOnlyBoundary } from './fixtures/local-only';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test.describe('Point 10 authenticated CR1 journeys', () => {
  test('tenant administrator can review transportation and trip operations', async ({ page }) => {
    await installAdminWorkflowMock(page);
    await installMapProviderAvailable(page);

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Transportation overview', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('admin-trip-search')).toBeVisible();
    const summary = page.getByTestId('transportation-summary');
    await expect(summary.getByRole('link')).toHaveCount(7);
    await summary.getByRole('link', { name: /Routes/ }).click();
    await expect(page).toHaveURL('/admin/routes');
    await page.getByRole('link', { name: 'Open route Route One', exact: true }).click();
    await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}`);
    await expect(page.getByRole('heading', { name: 'Route One', level: 1 })).toBeVisible();

    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Trip history', level: 1 })).toBeVisible();
    await expect(page.getByText('Route One')).toBeVisible();
  });

  for (const role of ['guardian', 'driver'] as const) {
    test(`website rejects a ${role} account before loading admin operations`, async ({ page }) => {
      const adminRequests: string[] = [];
      page.on('request', (request) => {
        if (/\/rest\/v1\/(buses|routes|driver_trips)(\?|$)/.test(request.url()))
          adminRequests.push(request.url());
      });
      if (role === 'guardian') await installAdminWorkflowMock(page, 'guardian');
      else await installSupabaseMock(page);
      await page.goto('/admin');
      await expect(
        page.getByRole('heading', { name: 'Use the correct BusSafe app', level: 1 }),
      ).toBeVisible();
      await expect(page.getByTestId('transportation-summary')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('sb-placeholder-auth-token')))
        .toBeNull();
      expect(adminRequests).toEqual([]);
    });
  }
});
