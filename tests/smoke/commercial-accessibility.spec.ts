import { expect, test } from '@playwright/test';
import { expectNoWcagAaViolations } from './fixtures/accessibility';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';
import { installSupabaseMock } from './fixtures/supabase-mock';

test.describe('Commercial WCAG 2.2 AA gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('public landing and sign-in surfaces', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SafeBus Alberta', level: 1 })).toBeVisible();
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

  test('driver bus-scan surface', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');
    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
    ).toBeVisible();
    await expectNoWcagAaViolations(page, 'Driver bus scan');
  });

  test('driver active-trip surface', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');
    await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Driver active trip');
  });

  test('guardian live bus surface', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/guardian/live');
    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toBeVisible();
    await expectNoWcagAaViolations(page, 'Guardian live bus status');
  });
});
