import { expect, test } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';
import { installMapProviderOutage } from './fixtures/map-provider';
import { installSupabaseMock } from './fixtures/supabase-mock';

test.describe('Point 10 safe degraded behavior', () => {
  test('profile-service failure is generic and does not expose backend details', async ({
    page,
  }) => {
    const rawBackendError = 'permission denied for relation profiles; request-id=private-123';
    await installSupabaseMock(page);
    await page.route('**/rest/v1/profiles*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: rawBackendError }),
      });
    });

    await page.goto('/driver');
    await expect(
      page.getByRole('heading', { name: 'Profile setup needed', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Your account is signed in, but no SafeBus profile was found. Ask an administrator to finish your profile setup.',
      ),
    ).toBeVisible();
    await expect(page.getByText(rawBackendError)).toHaveCount(0);
  });

  test('guardian data failure hides backend details and linked-student data', async ({ page }) => {
    const rawBackendError = 'row-level security policy leaked private guardian identifier';
    await installGuardianVisibilityMock(page, {
      rows: [guardianVisibilityRow()],
      fail: true,
      rawError: rawBackendError,
    });

    await page.goto('/guardian/live');
    await expect(page.getByTestId('guardian-live-error')).toContainText(
      'We could not load bus status right now.',
    );
    await expect(page.getByTestId('guardian-live-student-card')).toHaveCount(0);
    await expect(page.getByText(rawBackendError)).toHaveCount(0);
  });

  test('map outage preserves the authoritative admin route list and coordinates', async ({
    page,
  }) => {
    await installAdminWorkflowMock(page);
    await installMapProviderOutage(page);

    await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
    await expect(page.getByTestId('admin-routes-map-tile-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Route One', level: 1 })).toBeVisible();
    await expect(page.getByText('Pickup Stop')).toBeVisible();
  });

  test('unauthenticated users receive controlled denial on every private portal', async ({
    page,
  }) => {
    for (const path of ['/admin', '/driver', '/guardian/live']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Sign in required', level: 1 })).toBeVisible();
    }
  });
});
