import { expect, test, type Page } from '@playwright/test';
import { installSupabaseMock, MOCK } from './fixtures/supabase-mock';

async function openDirection(page: Page, direction: 'Outbound' | 'Return') {
  const toggle = page.getByTestId(`driver-${direction.toLowerCase()}-toggle`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  return toggle;
}

async function expandAssignment(page: Page, name: string) {
  await openDirection(page, name.includes('Return') ? 'Return' : 'Outbound');
  const card = page.getByTestId('driver-assignment-card').filter({ hasText: name });
  await card.getByTestId('driver-assignment-select-button').click();
  return card;
}

test.describe('Driver dashboard — authenticated', () => {
  test('renders closed direction groups with nested route cards', async ({ page }) => {
    await installSupabaseMock(page, { withAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Your assigned trips', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current trip assignments' })).toBeVisible();

    const outboundToggle = page.getByTestId('driver-outbound-toggle');
    const returnToggle = page.getByTestId('driver-return-toggle');
    await expect(outboundToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(returnToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);

    await outboundToggle.focus();
    await page.keyboard.press('Enter');
    await expect(outboundToggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(outboundToggle).toHaveAttribute('aria-expanded', 'false');

    await outboundToggle.click();
    await expect(outboundToggle).toHaveAttribute('aria-expanded', 'true');
    const card = page.getByTestId('driver-assignment-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('driver-assignment-route-name')).toHaveText(
      'North Ridge Morning',
    );
    await expect(card.getByTestId('driver-assignment-trip-name')).toHaveText(
      'North Ridge Outbound · Bus 12',
    );
    await expect(page.getByTestId('driver-assignment-start-button')).toHaveCount(0);

    await card.getByTestId('driver-assignment-select-button').click();
    await expect(page.getByTestId('driver-assignment-start-button')).toHaveText(
      'Start trip: North Ridge Outbound',
    );
  });

  test('keeps only one direction group open and clears the selected route', async ({ page }) => {
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    const outboundToggle = await openDirection(page, 'Outbound');
    const outboundCard = page
      .getByTestId('driver-assignment-card')
      .filter({ hasText: 'North Ridge Outbound' });
    await outboundCard.getByTestId('driver-assignment-select-button').click();
    await expect(outboundCard.getByTestId('driver-assignment-start-button')).toBeVisible();

    const returnToggle = page.getByTestId('driver-return-toggle');
    await returnToggle.click();

    await expect(outboundToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(returnToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(outboundCard).toHaveCount(0);
    await expect(
      page.getByTestId('driver-assignment-card').filter({ hasText: 'North Ridge Return' }),
    ).toBeVisible();

    await outboundToggle.click();
    await expect(
      page
        .getByTestId('driver-assignment-card')
        .filter({ hasText: 'North Ridge Outbound' })
        .getByTestId('driver-assignment-start-button'),
    ).toHaveCount(0);
  });

  test('confirms and starts the exact selected assignment, then opens pickup and drop-off', async ({
    page,
  }) => {
    let startedAssignmentId: string | undefined;
    let startRequests = 0;
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.route('**/rpc/start_driver_trip_from_assignment', async (route) => {
      startRequests += 1;
      startedAssignmentId = (route.request().postDataJSON() as { p_assignment_id?: string })
        .p_assignment_id;
      await route.fallback();
    });
    await page.goto('/driver');

    const returnCard = await expandAssignment(page, 'North Ridge Return');
    await returnCard.getByTestId('driver-assignment-start-button').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Start North Ridge Return?' })).toBeVisible();
    await expect(dialog).toContainText('North Ridge Morning (NR-AM)');
    await expect(dialog).toContainText('Named trip: North Ridge Return');
    await expect(dialog).toContainText('Bus: 12');
    expect(startRequests).toBe(0);

    await dialog.getByRole('button', { name: 'Start trip' }).click();
    await expect(page).toHaveURL(/\/driver\/pickup-drop-off$/);
    expect(startRequests).toBe(1);
    expect(startedAssignmentId).toBe(MOCK.secondAssignmentId);
  });

  test('shows only the active trip and hides every assignment control', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true, withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(page.getByRole('heading', { name: 'Your active trip', level: 1 })).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-only')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'North Ridge Outbound' })).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-manifest-button')).toBeVisible();
    await expect(page.getByTestId('driver-assigned-trips')).toHaveCount(0);
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);
    await expect(page.getByTestId('driver-outbound-toggle')).toHaveCount(0);
    await expect(page.getByTestId('driver-return-toggle')).toHaveCount(0);
    await expect(page.getByTestId('driver-assignment-start-button')).toHaveCount(0);
  });

  test('requires end-trip confirmation and restores the closed assignment chooser', async ({
    page,
  }) => {
    await installSupabaseMock(page, { withActiveTrip: true, withMultipleAssignments: true });
    await page.goto('/driver');

    const activeTrip = page.getByTestId('driver-active-trip-only');
    await activeTrip.getByRole('button', { name: 'End trip' }).click();

    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'End North Ridge Outbound?' })).toBeVisible();
    await expect(dialog).toContainText('North Ridge Morning');
    await expect(dialog).toContainText('Bus: 12');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(activeTrip).toBeVisible();

    await activeTrip.getByRole('button', { name: 'End trip' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'End trip' }).click();

    await expect(page.getByText('Trip ended. Nice work.')).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-only')).toHaveCount(0);
    await expect(page.getByTestId('driver-outbound-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByTestId('driver-return-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);
  });

  test('preserves active-trip-only mode across refresh', async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true, withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(page.getByTestId('driver-active-trip-only')).toBeVisible();
    await page.reload();

    await expect(page.getByRole('heading', { name: 'North Ridge Outbound' })).toBeVisible();
    await expect(page.getByTestId('driver-active-trip-only')).toBeVisible();
    await expect(page.getByTestId('driver-assigned-trips')).toHaveCount(0);
  });
});

test.describe('Driver dashboard — authenticated mobile layout', () => {
  test('renders large nested trip controls without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installSupabaseMock(page, { withMultipleAssignments: true });
    await page.goto('/driver');

    await expect(
      page.getByRole('heading', { name: 'Your assigned trips', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('driver-assignment-card')).toHaveCount(0);
    await openDirection(page, 'Outbound');
    const card = page.getByTestId('driver-assignment-card');
    await card.getByTestId('driver-assignment-select-button').click();
    const startButton = card.getByTestId('driver-assignment-start-button');
    await expect(startButton).toBeVisible();
    expect((await startButton.boundingBox())?.height).toBeGreaterThanOrEqual(48);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
