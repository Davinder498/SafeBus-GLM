import { expect, test } from '@playwright/test';
import {
  installGuardianVisibilityMock,
  guardianVisibilityRow,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock, MOCK } from '../smoke/fixtures/supabase-mock';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectUsableMobileLayout } from '../smoke/fixtures/responsive';

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} returns through the complete Account hierarchy`, async ({ page }, info) => {
    await installLocalOnlyBoundary(page);
    if (role === 'guardian') await installGuardianVisibilityMock(page);
    else await installSupabaseMock(page);
    await page.goto('/account');
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true, level: 1 }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${role}-account.png`), fullPage: true });
    for (const [label, path] of [
      ['Notification settings', role === 'driver' ? '/driver/settings' : '/notifications/settings'],
      ['Help & support', '/support'],
      ['Password & security', '/account/security'],
      ['Privacy notice', '/privacy'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
      await expect(page.locator('[data-ui="page-title"], main h1').first()).toBeVisible();
      await expect(page.getByTestId('native-bottom-navigation')).toHaveCount(0);
      await expectUsableMobileLayout(page);
      await page.screenshot({
        path: info.outputPath(`${role}-${label.replaceAll(' ', '-')}.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page).toHaveURL('/account');
    }
    await page.getByRole('link', { name: 'Password & security', exact: true }).click();
    await page.getByRole('link', { name: /Change password/ }).click();
    await expect(page).toHaveURL('/account/security/password');
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${role}-password.png`), fullPage: true });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL('/account/security');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL('/account');
  });
}

test('guardian map returns to bus details rather than jumping to Home', async ({ page }) => {
  await installLocalOnlyBoundary(page);
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.goto('/guardian/routes');
  await page.getByTestId('guardian-bus-details-link').click();
  await expect(page).toHaveURL('/guardian/buses/42');
  await page.getByRole('link', { name: /(?:See|View) live map/ }).click();
  await expect(page).toHaveURL(/guardian\/live-map/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL('/guardian/buses/42');
});

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} approved screen captures`, async ({ page }, info) => {
    await installLocalOnlyBoundary(page);
    if (role === 'guardian')
      await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
    else {
      await installSupabaseMock(page, { withActiveTrip: true, withCompletedTrips: true });
      await page.route('**/rest/v1/rpc/get_driver_active_trip_student_manifest_v2', (route) =>
        route.fulfill({
          json: [
            {
              active_trip_id: MOCK.tripId,
              student_id: 'aaaaaaaa-0000-0000-0000-000000000001',
              student_display_name: 'Avery Johnson',
              seat_number: 12,
              route_name: 'North Ridge',
              trip_name: 'Outbound',
              bus_number: '12',
              trip_status: 'active',
              trip_direction: 'forward',
              pickup_stop_name: 'Elm',
              dropoff_stop_name: 'School',
              assignment_status: 'active',
              pickup_event_time: null,
              dropoff_event_time: null,
              student_trip_status: 'not_picked_up',
            },
          ],
        }),
      );
    }
    const paths =
      role === 'guardian'
        ? [
            '/parent',
            '/guardian/routes',
            '/guardian/buses/42',
            '/guardian/events',
            '/guardian/live',
            '/notifications',
          ]
        : [
            '/driver',
            '/driver/pickup-drop-off',
            '/driver/history',
            '/driver/trip-actions',
            '/driver/record-exception',
          ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('[data-ui="app-bar"]')).toBeVisible();
      await expect(page.locator('[data-ui="page-title"], h1').first()).toBeVisible();
      const readyMarkers: Record<string, string> = {
        '/parent': 'guardian-home-bus-card',
        '/guardian/routes': 'guardian-routes-list',
        '/guardian/events': 'guardian-events-list',
        '/guardian/live': 'guardian-live-list',
        '/driver': 'driver-active-bus-card',
        '/driver/pickup-drop-off': 'driver-manifest-trip-context',
        '/driver/history': 'driver-trip-history-list',
        '/driver/trip-actions': 'driver-trip-action-cards',
        '/driver/record-exception': 'driver-exception-types',
      };
      if (readyMarkers[path]) await expect(page.getByTestId(readyMarkers[path])).toBeVisible();
      await expect(page.getByTestId('safebus-wordmark').last()).toHaveCSS(
        'color',
        'rgb(23, 43, 58)',
      );
      const privacyAcknowledgement = page.getByRole('button', {
        name: 'I understand',
        exact: true,
      });
      if (await privacyAcknowledgement.isVisible()) await privacyAcknowledgement.click();
      await expectUsableMobileLayout(page);
      await page.screenshot({
        path: info.outputPath(path.replaceAll('/', '-') + '.png'),
        fullPage: true,
      });
    }
  });
}
