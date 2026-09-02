import { expect, test } from '@playwright/test';
import {
  ADMIN_IDS as ids,
  installAdminWorkflowMock as mockAdmin,
} from './fixtures/admin-workflow';
import { installMapProviderAvailable, installMapProviderOutage } from './fixtures/map-provider';

test.describe('Simplified tenant admin workflow', () => {
  test('uses direct sidebar navigation choices', async ({ page }) => { await mockAdmin(page); await page.goto('/admin'); if ((page.viewportSize()?.width ?? 1280) < 1024) await page.getByRole('button', { name: 'Open navigation' }).click(); for (const label of ['Overview', 'Students', 'Guardians', 'Drivers', 'Buses', 'Routes', 'Live Operations']) await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Stops', exact: true })).toHaveCount(0); });
  test('overview shows active and inactive clickable route tiles that open route detail', async ({ page }) => {
    await mockAdmin(page);
    await installMapProviderAvailable(page);
    await page.goto('/admin');
    const tiles = page.getByTestId('admin-route-status-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(0)).toContainText('active');
    await expect(tiles.nth(1)).toContainText('inactive');
    await tiles.nth(0).click();
    await expect(page).toHaveURL(`/admin/routes/${ids.route}`);
    await expect(page.getByRole('heading', { name: 'Route One', level: 1 })).toBeVisible();
    await expect(page.getByText('Pickup Stop')).toBeVisible();
    await expect(page.getByTestId('admin-routes-map')).toBeVisible();
    await page.getByRole('link', { name: 'Manage route' }).click();
    await expect(page).toHaveURL(`/admin/routes/${ids.route}/manage`);
    await expect(page.getByRole('heading', { name: 'Edit R1', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Route name')).toHaveValue('Route One');
    await expect(page.getByLabel('Stop name')).toHaveValue('Pickup Stop');
  });
  test('map provider outage preserves route coordinates and direct stop editing', async ({ page }) => {
    await mockAdmin(page);
    await installMapProviderOutage(page);
    await page.goto(`/admin/routes/${ids.route}`);

    await expect(page.getByTestId('admin-routes-map-tile-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('admin-routes-map-fallback')).toContainText('Route One');
    await expect(page.getByText('Pickup Stop')).toBeVisible();

    await page.getByRole('link', { name: 'Manage route' }).click();
    await expect(page.getByTestId('route-stop-map-tile-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Latitude')).toHaveValue('51.0447');
    await expect(page.getByLabel('Longitude')).toHaveValue('-114.0719');
    await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
  });
  test('legacy setup link returns admins to the route overview', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/setup'); await expect(page).toHaveURL('/admin'); await expect(page.getByRole('heading', { name: 'Transportation overview', level: 1 })).toBeVisible(); await expect(page.getByTestId('admin-route-status-tile')).toHaveCount(2); await expect(page.getByRole('link', { name: 'Stops', exact: true })).toHaveCount(0); });
  test('legacy assignment links return admins to the record-based workflows', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/assignments'); await expect(page).toHaveURL('/admin/students'); await page.goto('/admin/driver-assignments'); await expect(page).toHaveURL('/admin/drivers'); });
  test('trips page shows current driver-created trip history', async ({ page }) => { await mockAdmin(page); await page.goto('/admin/trips'); await expect(page.getByRole('heading', { name: 'Trip history', level: 1 })).toBeVisible(); await expect(page.getByText('Review recent dated trip executions')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Notification delivery', level: 2 })).toBeVisible(); await expect(page.getByText('Route One')).toBeVisible(); await expect(page.getByText('Bus One')).toBeVisible(); await expect(page.getByText('Test Driver')).toBeVisible(); });
  test('guardian cannot access task-oriented admin pages', async ({ page }) => { await mockAdmin(page, 'guardian'); await page.goto('/admin/setup'); await expect(page.getByText('Wrong portal')).toBeVisible(); });
});
