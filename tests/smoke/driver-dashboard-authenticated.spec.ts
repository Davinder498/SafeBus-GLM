import { test, expect } from '@playwright/test';
import { installSupabaseMock } from './fixtures/supabase-mock';

/**
 * Authenticated driver dashboard smoke tests (updated for Milestone 4F —
 * assignment-based trip start).
 *
 * These tests use a mocked Supabase layer (see fixtures/supabase-mock.ts).
 * No production Supabase credentials are used, no real network calls are
 * made, and no test backdoors are added to the production app — all mocking
 * happens via Playwright `page.route` interception inside the test runner.
 *
 * Coverage:
 *   - authenticated driver dashboard rendering with assignment cards
 *   - start trip from assignment (active trip card appears, success message)
 *   - end trip (assignment list returns)
 *   - refresh persistence (active trip survives reload)
 *   - mobile layout
 */

test.describe('Driver dashboard — authenticated', () => {
  test('renders the driver dashboard with assignment cards', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    // Main heading
    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible();

    // Driver name card (scope to main to avoid matching the header banner)
    await expect(page.getByRole('main').getByText('Test Driver')).toBeVisible();

    // "Your assignments" heading
    await expect(page.getByRole('heading', { name: 'Your assignments' })).toBeVisible();

    // Assignment card is present with route name and Start Trip button
    await expect(page.getByTestId('driver-assignment-card')).toBeVisible();
    await expect(page.getByText('North Ridge Morning')).toBeVisible();
    await expect(page.getByTestId('driver-assignment-start-button')).toBeVisible();
  });

  test('starts a trip from an assignment', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    // Click Start Trip on the assignment card
    await page.getByTestId('driver-assignment-start-button').click();

    // The active trip card appears with the route name and an active status pill
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByText('active', { exact: true })).toBeVisible();

    // Success message is visible and NOT cleared by the silent refresh
    await expect(page.getByText('Trip started. Have a safe drive.')).toBeVisible();

    // End Trip button is now visible
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();

    // Start Trip button on the assignment card is gone (active trip card replaces the assignment list)
    await expect(page.getByTestId('driver-assignment-start-button')).toHaveCount(0);
  });

  test('ends an active trip and returns to the assignment list', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true, withAssignments: true });
    await page.goto('/driver');

    // Active trip card is shown immediately
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();

    // End the trip
    await page.getByRole('button', { name: 'End Trip' }).click();

    // Success message is visible
    await expect(page.getByText('Trip ended. Nice work.')).toBeVisible();

    // Assignment list returns with Start Trip button
    await expect(page.getByTestId('driver-assignment-card')).toBeVisible();
    await expect(page.getByTestId('driver-assignment-start-button')).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toHaveCount(0);
  });

  test('persists the active trip across a page refresh', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    // Start a trip from an assignment
    await page.getByTestId('driver-assignment-start-button').click();
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();

    // Reload — the mock layer still has the active trip in its internal state,
    // so the active trip should re-render after refresh.
    await page.reload();

    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();
  });
});

test.describe('Driver dashboard — authenticated mobile layout', () => {
  test('renders dashboard controls without horizontal overflow on mobile', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByTestId('driver-assignment-card')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
