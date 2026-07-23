import { expect, test } from '@playwright/test';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

const ACTIVE_TRIP_ERROR = 'You already have an active trip. End it before starting another.';

async function expandAssignment(page: import('@playwright/test').Page, name: string) {
  const card = page.getByTestId('driver-assignment-card').filter({ hasText: name });
  await card.getByTestId('driver-assignment-select-button').click();
  return card;
}

test.describe('Driver dashboard — authenticated', () => {
  test('renders assignment-first trip cards', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Your assigned trips', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current trip assignments' })).toBeVisible();

    const card = page.getByTestId('driver-assignment-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('driver-assignment-route-name')).toHaveText('North Ridge Morning');
    await expect(card.getByTestId('driver-assignment-trip-name')).toHaveText(
      'North Ridge Outbound · Bus 12',
    );
    await expect(card).toContainText('Ready');
    await expect(page.getByTestId('driver-assignment-start-button')).toHaveCount(0);

    await expandAssignment(page, 'North Ridge Outbound');
    await expect(page.getByTestId('driver-assignment-start-button')).toBeVisible();
  });

  test('starts the exact selected assignment and preserves all cards', async ({ page }) => {
    let startedAssignmentId: string | undefined;
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.route('**/rpc/start_driver_trip_from_assignment', async (route) => {
      startedAssignmentId = (route.request().postDataJSON() as { p_assignment_id?: string })
        .p_assignment_id;
      await route.fallback();
    });
    await page.goto('/driver');

    const returnCard = await expandAssignment(page, 'North Ridge Return');
    await returnCard.getByTestId('driver-assignment-start-button').click();

    await expect(page.getByRole('heading', { name: 'North Ridge Return' })).toBeVisible();
    await expect(
      page.getByText('Trip started. Location sharing is starting automatically.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Trip' })).toBeVisible();
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(2);
    await expect(returnCard).toContainText('In progress');
    expect(startedAssignmentId).toBe(MOCK.secondAssignmentId);
  });

  test('blocks a second assignment immediately while one trip is active', async ({ page }) => {
    let startRequests = 0;
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.route('**/rpc/start_driver_trip_from_assignment', async (route) => {
      startRequests += 1;
      await route.fallback();
    });
    await page.goto('/driver');

    const returnCard = await expandAssignment(page, 'North Ridge Return');
    await returnCard.getByTestId('driver-assignment-start-button').click();
    await expect(page.getByRole('heading', { name: 'North Ridge Return' })).toBeVisible();

    const outboundCard = await expandAssignment(page, 'North Ridge Outbound');
    await outboundCard.getByTestId('driver-assignment-start-button').click();

    await expect(page.getByRole('alert').filter({ hasText: ACTIVE_TRIP_ERROR })).toHaveText(
      ACTIVE_TRIP_ERROR,
    );
    await expect(page.getByRole('heading', { name: 'North Ridge Return' })).toBeVisible();
    expect(startRequests).toBe(1);
  });

  test('ending the active trip enables another assignment', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true, withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'North Ridge Outbound' })).toBeVisible();
    await page.getByRole('button', { name: 'End Trip' }).click();

    await expect(page.getByText('Trip ended. Nice work.')).toBeVisible();
    const returnCard = await expandAssignment(page, 'North Ridge Return');
    await expect(returnCard.getByTestId('driver-assignment-start-button')).toBeEnabled();
  });

  test('persists the exact active assignment across refresh', async ({ page }) => {
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    const returnCard = await expandAssignment(page, 'North Ridge Return');
    await returnCard.getByTestId('driver-assignment-start-button').click();
    await expect(page.getByRole('heading', { name: 'North Ridge Return' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'North Ridge Return' })).toBeVisible();
    await expect(
      page.getByTestId('driver-assignment-card').filter({ hasText: 'North Ridge Return' }),
    ).toContainText('In progress');
  });
});

test.describe('Driver dashboard — authenticated mobile layout', () => {
  test('renders trip controls without horizontal overflow on mobile', async ({ page }) => {
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Your assigned trips', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(2);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
