import { expect, test } from '@playwright/test';
import { installSupabaseMock } from './fixtures/supabase-mock';

test.describe('Driver completed trip history', () => {
  test('shows completed daily runs with the route as the primary label', async ({ page }) => {
    await installSupabaseMock(page, { withCompletedTrips: true });
    await page.goto('/driver/history');

    await expect(page.getByRole('heading', { name: 'Completed trips', level: 1 })).toBeVisible();
    const openNavigation = page.getByRole('button', { name: 'Open navigation' });
    if (await openNavigation.isVisible()) {
      await openNavigation.click();
    }
    await expect(page.getByRole('link', { name: 'Trip history' })).toBeVisible();

    const card = page.getByTestId('driver-completed-trip-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('driver-completed-trip-route-name')).toHaveText(
      'North Ridge Morning',
    );
    await expect(card).toContainText('North Ridge Outbound · Bus 12');
    await expect(card).toContainText('Completed');
    await expect(card).toContainText('1 hr 5 min');
  });

  test('shows a clear empty state before the driver completes a trip', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver/history');

    await expect(page.getByTestId('driver-trip-history-empty')).toBeVisible();
    await expect(page.getByText('No completed trips yet')).toBeVisible();
  });
});
