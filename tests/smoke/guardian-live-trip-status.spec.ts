import { expect, test } from '@playwright/test';
import {
  GUARDIAN_STUDENT_ID,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';

test.describe('Guardian live bus status', () => {
  test('shows active bus status without operational identifiers', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/guardian/live');

    await expect(page.getByRole('heading', { name: 'Live Bus Status', level: 1 })).toBeVisible();
    await expect(page.getByTestId('guardian-live-student-card')).toContainText('Avery Johnson');
    await expect(page.getByTestId('guardian-live-student-card')).toContainText('Bus 42');
    await expect(page.getByText('School run active')).toBeVisible();
    await expect(page.getByText('ETA temporarily unavailable')).toBeVisible();
    await expect(page.getByText(GUARDIAN_STUDENT_ID)).toHaveCount(0);
    await expect(page.getByText('51.0447')).toHaveCount(0);
  });

  test('shows the no-active-trip state', async ({ page }) => {
    await installGuardianVisibilityMock(page, {
      rows: [guardianVisibilityRow({ has_active_trip: false, location_state: 'inactive', latitude: null, longitude: null, location_recorded_at: null, student_trip_status: 'no_active_trip' })],
    });
    await page.goto('/guardian/live');
    await expect(page.getByText('Trip not started')).toBeVisible();
    await expect(page.getByText('ETA temporarily unavailable')).toHaveCount(0);
  });

  test('renders an empty state for no linked students', async ({ page }) => {
    await installGuardianVisibilityMock(page);
    await page.goto('/guardian/live');
    await expect(page.getByTestId('guardian-live-empty')).toContainText('No linked students are available yet.');
  });

  test('hides raw backend errors', async ({ page }) => {
    const rawError = 'permission denied: secret schema detail';
    await installGuardianVisibilityMock(page, { fail: true, rawError });
    await page.goto('/guardian/live');
    await expect(page.getByTestId('guardian-live-error')).toContainText('We could not load bus status right now.');
    await expect(page.getByText(rawError)).toHaveCount(0);
  });

  test('refreshes bus status', async ({ page }) => {
    const control = await installGuardianVisibilityMock(page, {
      rows: [guardianVisibilityRow({ has_active_trip: false, location_state: 'inactive', student_trip_status: 'no_active_trip' })],
    });
    await page.goto('/guardian/live');
    await expect(page.getByText('Trip not started')).toBeVisible();
    control.setRows([guardianVisibilityRow()]);
    await page.getByTestId('guardian-live-refresh-button').click();
    await expect(page.getByText('School run active')).toBeVisible();
    expect(control.getCallCount()).toBeGreaterThan(1);
  });

  test('blocks non-guardian roles', async ({ page }) => {
    await installGuardianVisibilityMock(page, { role: 'driver' });
    await page.goto('/guardian/live');
    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible();
  });
});
