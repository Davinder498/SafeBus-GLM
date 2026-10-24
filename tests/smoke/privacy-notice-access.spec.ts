import { expect, test } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installLocalOnlyBoundary } from './fixtures/local-only';
import { expectNoWcagAaViolations } from './fixtures/accessibility';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test('privacy notice is reachable before sign-in and explains all three roles', async ({
  page,
}) => {
  const operationalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rest/v1/'))
      operationalRequests.push(request.url());
  });
  await page.goto('/login');
  await page.getByRole('link', { name: 'Privacy Notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SafeBus privacy policy' })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Privacy notice sections' });
  for (const [name, heading, fragment] of [
    [
      'School authority administrators',
      'School authority administrator privacy notice',
      'tenant-administrators',
    ],
    ['Guardians', 'Guardian privacy notice', 'guardians'],
    ['Drivers', 'Driver privacy notice', 'drivers'],
  ]) {
    await sections.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${fragment}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeInViewport();
  }
  await expectNoWcagAaViolations(page);
  expect(operationalRequests).toEqual([]);
  await page.getByRole('link', { name: 'Account deletion instructions', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Request SafeBus account deletion' }),
  ).toBeVisible();
});

test('tenant admin uses the account menu for privacy without a duplicate sidebar link', async ({
  page,
}, testInfo) => {
  await installAdminWorkflowMock(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Transportation overview' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .getByRole('link', { name: 'Privacy Notice', exact: true }),
  ).toHaveCount(0);
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Privacy Notice', exact: true }).click();
  await expect(page).toHaveURL('/privacy');
  await expect(page.locator('[data-ui="dashboard-shell"]')).toHaveAttribute('data-portal', 'admin');
  await expect(
    page.getByRole('heading', { name: 'School authority administrator privacy notice' }),
  ).toBeVisible();
  await expectNoWcagAaViolations(page);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Transportation overview' })).toBeVisible();
  const drawerButton = page.getByRole('button', { name: 'Open navigation' });
  if (await drawerButton.isVisible()) await drawerButton.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .getByRole('link', { name: 'Privacy Notice', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('sidebar-without-privacy.png'),
    fullPage: true,
    animations: 'disabled',
  });
  if (await page.getByRole('button', { name: 'Close navigation' }).isVisible())
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Privacy Notice', exact: true }).click();
  await expect(page).toHaveURL('/privacy');
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0);
});

test('expired invitation still offers the public privacy notice', async ({ page }) => {
  await page.goto('/accept-invitation');
  await page.getByRole('link', { name: 'Read the privacy notice', exact: true }).click();
  await expect(page).toHaveURL('/privacy');
  await expect(page.getByRole('heading', { name: 'Guardian privacy notice' })).toBeVisible();
});
