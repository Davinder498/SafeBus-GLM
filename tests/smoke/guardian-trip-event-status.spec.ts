import { expect, test } from '@playwright/test';
import {
  GUARDIAN_STUDENT_ID,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from './fixtures/guardian-bus-visibility';

test.describe('Guardian pickup and drop-off status', () => {
  test('renders each bus-first trip status', async ({ page }) => {
    await installGuardianVisibilityMock(page, {
      rows: [
        guardianVisibilityRow({ student_id: `${GUARDIAN_STUDENT_ID.slice(0, -1)}1`, student_name: 'Avery Johnson' }),
        guardianVisibilityRow({ student_id: `${GUARDIAN_STUDENT_ID.slice(0, -1)}2`, student_name: 'Blair Singh', student_trip_status: 'picked_up', pickup_event_time: '2026-01-01T15:05:00.000Z', last_event_time: '2026-01-01T15:05:00.000Z' }),
        guardianVisibilityRow({ student_id: `${GUARDIAN_STUDENT_ID.slice(0, -1)}3`, student_name: 'Casey Chen', student_trip_status: 'dropped_off', pickup_event_time: '2026-01-01T15:05:00.000Z', dropoff_event_time: '2026-01-01T22:10:00.000Z', last_event_time: '2026-01-01T22:10:00.000Z' }),
        guardianVisibilityRow({ student_id: `${GUARDIAN_STUDENT_ID.slice(0, -1)}4`, student_name: 'Devon Lee', has_active_trip: false, location_state: 'inactive', student_trip_status: 'no_active_trip' }),
      ],
    });
    await page.goto('/guardian/events');

    await expect(page.getByRole('heading', { name: 'Pickup & Drop-off Status', level: 1 })).toBeVisible();
    await expect(page.getByText('Not picked up')).toBeVisible();
    await expect(page.getByText('Picked up', { exact: true })).toBeVisible();
    await expect(page.getByText('Dropped off')).toBeVisible();
    await expect(page.getByText('No active bus run')).toBeVisible();
    await expect(page.getByText('Pickup time:', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Drop-off time:', { exact: false })).toBeVisible();
  });

  test('renders an empty state for no linked students', async ({ page }) => {
    await installGuardianVisibilityMock(page);
    await page.goto('/guardian/events');
    await expect(page.getByTestId('guardian-events-empty')).toContainText('No linked students are available yet.');
  });

  test('hides raw backend errors', async ({ page }) => {
    const rawError = 'private event table failure';
    await installGuardianVisibilityMock(page, { fail: true, rawError });
    await page.goto('/guardian/events');
    await expect(page.getByTestId('guardian-events-error')).toContainText('We could not load pickup and drop-off status.');
    await expect(page.getByText(rawError)).toHaveCount(0);
  });

  test('refreshes the current status without direct event-table access', async ({ page }) => {
    let directEventRead = false;
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/student_trip_events')) directEventRead = true;
    });
    const control = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/guardian/events');
    control.setRows([guardianVisibilityRow({ student_trip_status: 'picked_up', pickup_event_time: '2026-01-01T15:05:00.000Z' })]);
    await page.getByTestId('guardian-events-refresh-button').click();
    await expect(page.getByText('Picked up', { exact: true })).toBeVisible();
    expect(directEventRead).toBe(false);
  });

  test('does not render sensitive or operational fields', async ({ page }) => {
    await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    await page.goto('/guardian/events');
    await expect(page.getByTestId('guardian-events-student-card')).toBeVisible();
    for (const forbidden of [GUARDIAN_STUDENT_ID, '51.0447', '-114.0719', 'driver_id', 'route_id']) {
      await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
    }
  });

  test('blocks non-guardian roles', async ({ page }) => {
    await installGuardianVisibilityMock(page, { role: 'tenant_admin' });
    await page.goto('/guardian/events');
    await expect(page.getByRole('heading', { name: 'Wrong portal' })).toBeVisible();
  });
});
