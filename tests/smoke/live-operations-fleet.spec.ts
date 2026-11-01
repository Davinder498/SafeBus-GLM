import { expect, test } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';

function activeBus(
  bus: string,
  locationStatus: 'live' | 'stale' | 'missing',
  issueLabel: 'OK' | 'Stale GPS' | 'Missing GPS',
) {
  return {
    bus_label: bus,
    route_name: 'Morning route',
    driver_name: 'Test Driver',
    trip_type: 'morning',
    status: 'active',
    started_at: '2026-10-28T14:00:00Z',
    latest_latitude: locationStatus === 'missing' ? null : 51.04,
    latest_longitude: locationStatus === 'missing' ? null : -114.07,
    latest_location_at: locationStatus === 'missing' ? null : '2026-10-28T14:02:00Z',
    speed_mps: null,
    location_status: locationStatus,
    issue_label: issueLabel,
    next_stop_name: 'School',
    eta_status: null,
    eta_label: null,
    eta_updated_at: null,
  };
}

test('tenant admin sees only RPC-backed fleet statuses; failed refresh clears last GPS positions', async ({ page }) => {
  await installAdminWorkflowMock(page);
  let failed = false;
  let called = 0;
  await page.route('**/rest/v1/rpc/get_admin_live_fleet_monitoring', (route) => {
    called++;
    return route.fulfill({
      status: failed ? 503 : 200,
      contentType: 'application/json',
      body: failed
        ? JSON.stringify({ message: 'Unavailable' })
        : JSON.stringify([
            activeBus('101', 'live', 'OK'),
            activeBus('102', 'stale', 'Stale GPS'),
            activeBus('103', 'missing', 'Missing GPS'),
          ]),
    });
  });

  await page.goto('/admin/live-trips');
  const fleet = page.getByTestId('admin-fleet-operations');
  await expect(fleet.getByTestId('admin-fleet-summary')).toBeVisible();
  await expect(fleet.getByTestId('admin-fleet-list').locator('li')).toHaveCount(3);
  await expect(fleet).toContainText('GPS stale');
  await expect(fleet).toContainText('No GPS signal');
  await expect(fleet.getByText('ETA: Not verified')).toHaveCount(3);
  await expect(page.getByTestId('admin-trip-search')).toBeVisible();
  await expect(page.getByTestId('admin-fleet-map-unavailable')).toHaveCount(0);
  expect(called).toBeGreaterThanOrEqual(1);

  await fleet.getByRole('button', { name: 'Needs attention' }).click();
  await expect(fleet.getByTestId('admin-fleet-list').locator('li')).toHaveCount(2);
  failed = true;
  await fleet.getByRole('button', { name: 'Refresh fleet' }).click();
  await expect(fleet.getByTestId('admin-fleet-error')).toBeVisible();
  await expect(fleet.getByTestId('admin-fleet-list')).toHaveCount(0);
});

test('school admin never requests tenant fleet data but retains secured trip search', async ({ page }) => {
  await installAdminWorkflowMock(page, 'school_admin');
  let fleetRequests = 0;
  await page.route('**/rest/v1/rpc/get_admin_live_fleet_monitoring', (route) => {
    fleetRequests++;
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/admin/live-trips');
  await expect(page.getByTestId('school-admin-fleet-restricted')).toBeVisible();
  await expect(page.getByTestId('admin-trip-search')).toBeVisible();
  await expect(page.getByTestId('admin-fleet-operations')).toHaveCount(0);
  expect(fleetRequests).toBe(0);
});

test('transportation admin can view tenant-wide active fleet snapshot', async ({ page }) => {
  await installAdminWorkflowMock(page, 'transportation_admin');
  await page.goto('/admin/live-trips');
  await expect(page.getByTestId('admin-fleet-operations')).toBeVisible();
  await expect(page.getByTestId('admin-trip-search')).toBeVisible();
});
