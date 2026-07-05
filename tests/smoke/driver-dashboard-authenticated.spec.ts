import { test, expect } from '@playwright/test';
import { installSupabaseMock } from './fixtures/supabase-mock';

/**
 * Authenticated driver dashboard smoke tests.
 *
 * These tests use a mocked Supabase layer (see fixtures/supabase-mock.ts).
 * No production Supabase credentials are used, no real network calls are
 * made, and no test backdoors are added to the production app — all mocking
 * happens via Playwright `page.route` interception inside the test runner.
 *
 * Coverage:
 *   - authenticated driver dashboard rendering
 *   - bus/route controls present
 *   - morning/evening trip-type selector
 *   - start trip behavior (active trip card appears, success message visible)
 *   - active trip display
 *   - end trip behavior (start card returns, success message visible)
 *   - refresh persistence (active trip survives reload)
 *   - mobile layout
 */

test.describe('Driver dashboard — authenticated', () => {
  test('renders the driver dashboard with bus/route controls and trip-type selector', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    // Main heading
    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible();

    // Driver name card (scope to main to avoid matching the header banner)
    await expect(page.getByRole('main').getByText('Test Driver')).toBeVisible();

    // Start a trip card heading
    await expect(page.getByRole('heading', { name: 'Start a trip' })).toBeVisible();

    // Bus and Route selects are present and labelled
    await expect(page.getByLabel('Bus')).toBeVisible();
    await expect(page.getByLabel('Route')).toBeVisible();

    // Trip type radio group with Morning and Evening options
    await expect(page.getByRole('radiogroup', { name: 'Trip type' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Morning' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Evening' })).toBeVisible();

    // Start Trip button is present but disabled until a bus and route are selected
    const startButton = page.getByRole('button', { name: 'Start Trip' });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
  });

  test('enables Start Trip after selecting a bus and route, then starts the trip', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    const startButton = page.getByRole('button', { name: 'Start Trip' });
    await expect(startButton).toBeDisabled();

    // Select a bus and a route
    await page.getByLabel('Bus').selectOption({ index: 1 });
    await page.getByLabel('Route').selectOption({ index: 1 });
    await expect(startButton).toBeEnabled();

    // Start the trip
    await startButton.click();

    // The active trip card appears with the route name and an active status pill
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByText('active', { exact: true })).toBeVisible();

    // Success message is visible and NOT cleared by the silent refresh
    await expect(page.getByText('Trip started. Have a safe drive.')).toBeVisible();

    // End Trip button is now visible
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();

    // Start Trip button is gone (active trip card replaces the start form)
    await expect(page.getByRole('button', { name: 'Start Trip' })).toHaveCount(0);
  });

  test('ends an active trip and returns to the start-trip card', async ({ page }) => {
    // Seed an active trip on initial load.
    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver');

    // Active trip card is shown immediately
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();

    // End the trip
    await page.getByRole('button', { name: 'End Trip' }).click();

    // Success message is visible
    await expect(page.getByText('Trip ended. Nice work.')).toBeVisible();

    // Start a trip card returns
    await expect(page.getByRole('heading', { name: 'Start a trip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Trip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toHaveCount(0);
  });

  test('persists the active trip across a page refresh', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    // Start a trip
    await page.getByLabel('Bus').selectOption({ index: 1 });
    await page.getByLabel('Route').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Start Trip' }).click();
    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();

    // Reload — the mock layer still has the active trip in its internal state
    // (because the route handler closure retains it), so the active trip
    // should re-render after refresh.
    await page.reload();

    await expect(page.getByRole('heading', { name: 'North Ridge Morning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();
  });

  test('selecting Evening trip type updates the selection', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    const morning = page.getByRole('radio', { name: 'Morning' });
    const evening = page.getByRole('radio', { name: 'Evening' });

    await expect(morning).toBeChecked();
    await expect(evening).not.toBeChecked();

    await evening.click();
    await expect(evening).toBeChecked();
    await expect(morning).not.toBeChecked();
  });
});

test.describe('Driver dashboard — authenticated mobile layout', () => {
  test('renders dashboard controls without horizontal overflow on mobile', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Driver Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Bus')).toBeVisible();
    await expect(page.getByLabel('Route')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Trip type' })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
