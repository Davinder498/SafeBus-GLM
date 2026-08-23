import { expect, test } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';
import { installMapProviderAvailable } from './fixtures/map-provider';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

test.describe('Point 10 authenticated CR1 journeys', () => {
  test('tenant administrator can review transportation and trip operations', async ({ page }) => {
    await installAdminWorkflowMock(page);
    await installMapProviderAvailable(page);

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Transportation overview', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('admin-route-status-tile')).toHaveCount(2);

    await page.getByTestId('admin-route-status-tile').first().click();
    await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}`);
    await expect(page.getByRole('heading', { name: 'Route One', level: 1 })).toBeVisible();

    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Trip history', level: 1 })).toBeVisible();
    await expect(page.getByText('Route One')).toBeVisible();
  });

  test('driver can start and end the assigned bus trip from the QR workflow', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719 });
    await installSupabaseMock(page);

    await page.goto('/driver');
    await page.getByTestId('driver-scan-bus-qr').click();
    await page.getByLabel('Manual bus QR token for QA').fill(MOCK.busQrToken);
    await page.getByRole('button', { name: 'Connect' }).click();
    await page.getByRole('button', { name: /North Ridge Outbound/ }).click();

    await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
    await expect(page.getByText('This phone is now its GPS.')).toBeVisible();

    await page
      .getByTestId('driver-active-trip-only')
      .getByRole('button', { name: 'End trip' })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'End trip' }).click();
    await expect(page.getByText('Trip ended. Location sharing stopped.')).toBeVisible();
  });

  test('guardian sees only the linked-student bus status contract', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });

    await page.goto('/guardian/live');
    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toBeVisible();
    await expect(page.getByTestId('guardian-live-student-card')).toContainText('Avery Johnson');
    await expect(page.getByTestId('guardian-live-student-card')).toContainText('Bus 42');
    await expect(page.getByText('School run active')).toBeVisible();
    await expect(page.getByText('51.0447')).toHaveCount(0);
  });

  test('role guards keep guardian and driver accounts out of admin and guardian portals', async ({
    page,
  }) => {
    await installAdminWorkflowMock(page, 'guardian');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Wrong portal', level: 1 })).toBeVisible();

    const driverPage = await page.context().newPage();
    await installGuardianVisibilityMock(driverPage, { role: 'driver' });
    await driverPage.goto('/guardian/live');
    await expect(driverPage.getByRole('heading', { name: 'Wrong portal', level: 1 })).toBeVisible();
  });
});
