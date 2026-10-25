import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from './fixtures/local-only';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';

test('school authority admin can edit and reload the published address', async ({ page }) => {
  await installLocalOnlyBoundary(page);
  await installAdminWorkflowMock(page);
  let contact = {
    displayName: 'Transportation office',
    email: 'transport@example.test',
    phone: null,
    websiteUrl: null,
    supportHours: null,
    instructions: null,
    address: '123 School Road',
    updatedAt: '2026-10-25T00:00:00Z',
  };
  await page.route('**/rest/v1/rpc/get_support_directory_v2', (route) =>
    route.fulfill({ json: { platform: null, tenant: contact } }),
  );
  await page.route('**/rest/v1/rpc/update_tenant_support_contact_v2', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.p_address).toBe('456 Authority Road\nCalgary AB');
    contact = { ...contact, address: body.p_address };
    await route.fulfill({ json: null });
  });
  await page.goto('/admin/settings/support');
  await expect(page.getByLabel('School authority address', { exact: true })).toHaveValue(
    '123 School Road',
  );
  await page
    .getByLabel('School authority address', { exact: true })
    .fill('456 Authority Road\nCalgary AB');
  await page.getByRole('button', { name: 'Save support details', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Contact details updated');
  await page.reload();
  await expect(page.getByLabel('School authority address', { exact: true })).toHaveValue(
    '456 Authority Road\nCalgary AB',
  );
});
