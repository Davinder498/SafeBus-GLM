import { expect, test, type Page } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';

const driverId = '33333333-3333-3333-3333-333333333333';
const guardianId = '99999999-9999-9999-9999-999999999999';

async function installPeopleRosterMock(page: Page) {
  await page.route('**/rest/v1/rpc/get_admin_paginated_list', async (route) => {
    const entity = (route.request().postDataJSON() as { p_entity?: string } | null)?.p_entity;
    const rows =
      entity === 'drivers'
        ? [
            {
              id: driverId,
              tenant_id: '22222222-2222-2222-2222-222222222222',
              profile_id: '11111111-1111-1111-1111-111111111111',
              employee_number: 'D-100',
              first_name: 'Jordan',
              last_name: 'Driver',
              full_name: 'Jordan Driver',
              email: 'jordan.driver@example.test',
              phone: '403-555-0100',
              license_expiry_date: '2030-01-31',
              status: 'active',
            },
          ]
        : entity === 'guardians'
          ? [
              {
                id: guardianId,
                tenant_id: '22222222-2222-2222-2222-222222222222',
                profile_id: '88888888-8888-8888-8888-888888888888',
                first_name: 'Taylor',
                last_name: 'Guardian',
                full_name: 'Taylor Guardian',
                email: 'taylor.guardian@example.test',
                phone: '403-555-0200',
                status: 'active',
                active_link_count: 2,
              },
            ]
          : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows, totalCount: rows.length, page: 1, pageSize: 50 }),
    });
  });
}

test.describe('admin people roster interactions', () => {
  test('the full driver row opens details and keeps the view icon separate from licence text', async ({
    page,
  }) => {
    await installAdminWorkflowMock(page);
    await installPeopleRosterMock(page);
    await page.goto('/admin/drivers');

    const row = page.getByTestId('admin-driver-row');
    await expect(row).toHaveAttribute('role', 'link');

    const expiry = row.getByText('Expires Jan 31, 2030');
    const viewIcon = row.getByTestId('admin-driver-row-view-icon');
    const expiryBox = await expiry.boundingBox();
    const iconBox = await viewIcon.boundingBox();
    expect(expiryBox).not.toBeNull();
    expect(iconBox).not.toBeNull();
    expect(iconBox!.x - (expiryBox!.x + expiryBox!.width)).toBeGreaterThanOrEqual(16);

    await row.getByText('jordan.driver@example.test').click();
    await expect(page).toHaveURL(`/admin/drivers/${driverId}`);
  });

  test('the full guardian row opens details with mouse and keyboard navigation', async ({ page }) => {
    await installAdminWorkflowMock(page);
    await installPeopleRosterMock(page);
    await page.goto('/admin/guardians');

    const row = page.getByTestId('admin-guardian-row');
    await expect(row).toHaveAttribute('role', 'link');
    await expect(row.getByTestId('admin-guardian-row-view-icon')).toBeVisible();

    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/admin/guardians/${guardianId}`);
  });
});
