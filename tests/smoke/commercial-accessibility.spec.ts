import { expect, test } from '@playwright/test';
import { expectNoWcagAaViolations } from './fixtures/accessibility';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installLocalOnlyBoundary } from './fixtures/local-only';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test.describe('Commercial WCAG 2.2 AA gate', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('public landing and sign-in surfaces', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SafeBus', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Public landing page');

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Sign-in page');
  });

  test('tenant-admin operations surfaces', async ({ page }) => {
    await installAdminWorkflowMock(page);
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Transportation overview', level: 1 }),
    ).toBeVisible();
    await expectNoWcagAaViolations(page, 'Tenant-admin overview');

    await page.goto('/admin/trips');
    await expect(page.getByRole('heading', { name: 'Trip history', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Tenant-admin trip history');
  });
});
