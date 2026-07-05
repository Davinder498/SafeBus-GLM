import { test, expect } from '@playwright/test';

/**
 * SafeBus driver dashboard smoke tests.
 *
 * These tests cover the protected-route behaviour for unauthenticated users and
 * basic app rendering. They do not use production Supabase data or credentials
 * and do not add any backdoors to the production app.
 *
 * Authenticated driver dashboard interactions (selecting a bus/route, starting
 * and ending a trip, active-trip display) require a real Supabase auth session
 * and tenant data. There is no authenticated test harness in the repo yet, so
 * those flows are documented as uncovered and recommended for a future
 * milestone that adds a mock-Supabase test layer.
 */

test.describe('Driver dashboard — protected route', () => {
  test('shows a sign-in prompt to unauthenticated users', async ({ page }) => {
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible();
    await expect(
      page.getByText('Use your SafeBus account to access this dashboard.'),
    ).toBeVisible();
  });

  test('offers a link to the login page', async ({ page }) => {
    await page.goto('/driver');

    const loginLink = page.getByRole('link', { name: 'Go to login' });
    await expect(loginLink).toBeVisible();
    await loginLink.click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Sign in to SafeBus' }),
    ).toBeVisible();
  });
});

test.describe('Landing page', () => {
  test('renders the SafeBus brand heading', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'SafeBus Alberta', level: 1 }),
    ).toBeVisible();
  });

  test('links to the login page', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Open demo' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Driver dashboard — mobile viewport', () => {
  test('renders the sign-in prompt without horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
