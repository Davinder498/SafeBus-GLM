import { expect, test, type Locator } from '@playwright/test';
import {
  guardianBusServiceLine,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';

async function expectTouchTargets(controls: Locator) {
  await expect(controls.first()).toBeVisible();
  // Entrance translations briefly produce fractional bounding boxes. Wait for
  // settled layout without weakening the 48px minimum in either dimension.
  await expect
    .poll(async () =>
      controls.evaluateAll((elements) =>
        elements.length === 0
          ? 0
          : Math.min(
              ...elements.flatMap((element) => {
                const { width, height } = element.getBoundingClientRect();
                return [width, height];
              }),
            ),
      ),
    )
    .toBeGreaterThanOrEqual(48);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectMaterialBrand(page: import('@playwright/test').Page) {
  const mark = page.getByTestId('safebus-brand-mark').last();
  await expect(mark).toBeVisible();
  const logo = mark.locator('img');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /safebus-official-mark.*\.svg/);
  await expect(logo).toHaveAttribute('alt', '');
  await expect(mark.locator('svg')).toHaveCount(0);
  await expect(mark).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(logo).toHaveCSS('border-radius', '18%');
}

async function installNotificationInboxMock(
  page: import('@playwright/test').Page,
  options: { driver?: boolean } = {},
) {
  let readAt: string | null = null;
  let markAllReadCalls = 0;
  const notification = options.driver
    ? {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        event_type: 'driver_assignment_changed',
        category: 'assignments',
        severity: 'info',
        title: 'Assignment changed',
        body: 'Your planned work assignment has changed.',
        occurred_at: '2026-09-01T12:00:00Z',
        created_at: '2026-09-01T12:00:00Z',
        read_at: readAt,
        archived_at: null,
        destination_path:
          '/notifications?notification=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }
    : {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        event_type: 'trip_cancelled',
        category: 'trip_status',
        severity: 'urgent',
        title: 'Trip cancelled',
        body: 'Bus service status has changed.',
        occurred_at: '2026-09-01T12:00:00Z',
        created_at: '2026-09-01T12:00:00Z',
        read_at: readAt,
        archived_at: null,
        destination_path:
          '/notifications?notification=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      };

  await page.route('**/rest/v1/rpc/get_user_notification_unread_count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: readAt ? '0' : '1' }),
  );
  await page.route('**/rest/v1/rpc/get_user_notifications', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...notification, read_at: readAt }]),
    }),
  );
  await page.route('**/rest/v1/rpc/mark_all_user_notifications_read', (route) => {
    markAllReadCalls += 1;
    readAt = '2026-09-28T22:00:00Z';
    return route.fulfill({ status: 200, contentType: 'application/json', body: '1' });
  });

  return {
    getMarkAllReadCallCount: () => markAllReadCalls,
  };
}

test('guardian shell uses the branded Material mobile treatment', async ({ page }, testInfo) => {
  await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
    studentStops: [
      {
        student_id: '33333333-3333-3333-3333-333333333333',
        bus_number: '42',
        trip_name: 'Morning school run',
        direction: 'forward',
        pickup_stop_name: 'Cedar Avenue',
        dropoff_stop_name: 'Riverside School',
      },
    ],
  });
  await page.goto('/parent');

  await expect(page.getByRole('heading', { name: 'My Buses', level: 1 })).toBeVisible();
  await expect(page.locator('[data-ui="dashboard-shell"]')).toHaveCSS(
    'background-color',
    'rgb(242, 246, 247)',
  );
  await expectMaterialBrand(page);
  await expect(page.getByText('Track the assigned bus during an active school run.')).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'Bus number and license plate' })).toHaveCount(0);
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  const homeBusLink = page.getByRole('link', { name: 'View details for Bus 42' });
  const homeBusCard = page.getByTestId('guardian-home-bus-card');
  await expect(homeBusLink).toHaveAttribute('href', '/guardian/buses/42');
  await expect(homeBusCard).not.toContainText('License plate');
  await expect(homeBusCard).not.toContainText('TEST-42');
  await expect(homeBusCard).not.toContainText('live');
  await expect(homeBusCard).not.toContainText('View bus details');
  await expect(homeBusCard).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('[data-ui="dashboard-shell"]')).toHaveCSS(
    'background-color',
    'rgb(242, 246, 247)',
  );
  await expect(page.getByTestId('guardian-home-student-card')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.getByTestId('native-bottom-navigation')).toHaveCSS(
    'background-color',
    'rgb(23, 43, 58)',
  );
  const activeStatus = homeBusCard.locator('[data-ui="status-pill"][data-tone="success"]');
  await expect(activeStatus).toHaveAttribute('data-pulse', 'true');
  await expect(activeStatus).toHaveCSS('color', 'rgb(22, 101, 52)');
  const studentCard = page.getByTestId('guardian-home-student-card');
  await expect(studentCard).toContainText('Avery Johnson');
  await expect(studentCard).toContainText('Bus 42');
  await expect(studentCard).toContainText('Cedar Avenue');
  await expect(studentCard).toContainText('Riverside School');

  const tabs = page.getByTestId('native-bottom-navigation').getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.filter({ hasText: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.filter({ hasText: 'Updates' })).toHaveAttribute('href', '/notifications');
  await expect(tabs.filter({ hasText: 'Settings' })).toHaveAttribute(
    'href',
    '/notifications/settings',
  );

  await expectTouchTargets(tabs);

  await expectTouchTargets(homeBusLink);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('guardian-home.png') });
  await homeBusLink.click();
  await expect(page).toHaveURL('/guardian/buses/42');
  await expect(page.getByText('License plate')).toBeVisible();
  await expect(page.getByText('TEST-42')).toBeVisible();
  await page.getByRole('link', { name: 'See live map' }).click();
  await expect(page.getByTestId('guardian-fullscreen-map')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bus 42 live map' })).toBeVisible();
  await expect(page.getByTestId('guardian-fullscreen-map')).toHaveCSS(
    'background-color',
    'rgb(242, 246, 247)',
  );
  await expect(page.locator('[data-ui="guardian-map-app-bar"]')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.screenshot({ path: testInfo.outputPath('guardian-live-map.png') });
  await expect(page.getByTestId('native-bottom-navigation')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});

test('guardian home keeps each linked student with their own bus and stops', async ({ page }) => {
  await installGuardianVisibilityMock(page, {
    rows: [
      guardianVisibilityRow(),
      guardianVisibilityRow({
        student_id: '44444444-4444-4444-4444-444444444444',
        student_name: 'Morgan Johnson',
        bus_number: '27',
      }),
    ],
    studentStops: [
      {
        student_id: '33333333-3333-3333-3333-333333333333',
        bus_number: '42',
        trip_name: 'Morning run',
        direction: 'forward',
        pickup_stop_name: 'Cedar Avenue',
        dropoff_stop_name: 'Riverside School',
      },
      {
        student_id: '44444444-4444-4444-4444-444444444444',
        bus_number: '27',
        trip_name: 'Evening run',
        direction: 'reverse',
        pickup_stop_name: 'Hill School',
        dropoff_stop_name: 'Oak Street',
      },
    ],
  });
  await page.goto('/parent');

  const cards = page.getByTestId('guardian-home-student-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Avery Johnson');
  await expect(cards.nth(0)).toContainText('Cedar Avenue');
  await expect(cards.nth(0)).not.toContainText('Oak Street');
  await expect(cards.nth(1)).toContainText('Morgan Johnson');
  await expect(cards.nth(1)).toContainText('Bus 27');
  await expect(cards.nth(1)).toContainText('Oak Street');
  await expect(cards.nth(1)).not.toContainText('Cedar Avenue');
});

test('guardian home gives each current bus state a distinct accessible treatment', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installGuardianVisibilityMock(page, {
    rows: [
      guardianVisibilityRow(),
      guardianVisibilityRow({
        student_id: '44444444-4444-4444-4444-444444444444',
        student_name: 'Morgan Johnson',
        bus_number: '27',
        location_state: 'stale',
      }),
      guardianVisibilityRow({
        student_id: '55555555-5555-5555-5555-555555555555',
        student_name: 'Taylor Johnson',
        bus_number: '53',
        location_state: 'missing',
      }),
      guardianVisibilityRow({
        student_id: '66666666-6666-6666-6666-666666666666',
        student_name: 'Jordan Johnson',
        bus_number: '64',
        has_active_trip: false,
        location_state: 'inactive',
      }),
    ],
  });
  await page.goto('/parent');

  const active = page.getByRole('link', { name: 'View details for Bus 42' });
  const delayed = page.getByRole('link', { name: 'View details for Bus 27' });
  const unavailable = page.getByRole('link', { name: 'View details for Bus 53' });
  const inactive = page.getByRole('link', { name: 'View details for Bus 64' });

  await expect(active.locator('[data-ui="status-pill"]')).toHaveAttribute('data-tone', 'success');
  await expect(active.locator('[data-ui="status-pill"]')).toContainText('Active');
  await expect(active.locator('.status-pill__dot')).toHaveCSS(
    'animation-name',
    'guardian-live-status-pulse',
  );
  await expect(delayed.locator('[data-ui="status-pill"]')).toHaveAttribute('data-tone', 'warning');
  await expect(delayed.locator('[data-ui="status-pill"]')).toContainText('Delayed');
  await expect(unavailable.locator('[data-ui="status-pill"]')).toHaveAttribute(
    'data-tone',
    'warning',
  );
  await expect(unavailable.locator('[data-ui="status-pill"]')).toContainText(
    'Location unavailable',
  );
  await expect(inactive.locator('[data-ui="status-pill"]')).toHaveAttribute('data-tone', 'neutral');
  await expect(inactive.locator('[data-ui="status-pill"]')).toContainText('Inactive');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(active.locator('.status-pill__dot')).toHaveCSS('animation-name', 'none');
});

test('guardian buses group students and open a clean bus detail view', async ({
  page,
}, testInfo) => {
  const guardianMock = await installGuardianVisibilityMock(page, {
    rows: [
      guardianVisibilityRow({ student_name: 'Avery Johnson' }),
      guardianVisibilityRow({
        student_id: '44444444-4444-4444-4444-444444444444',
        student_name: 'Morgan Johnson',
        student_grade: '6',
      }),
      guardianVisibilityRow({
        student_id: '55555555-5555-5555-5555-555555555555',
        student_name: 'Taylor Johnson',
        student_grade: '8',
        bus_number: '27',
        license_plate: 'TEST-27',
        has_active_trip: false,
        location_state: 'inactive',
        latitude: null,
        longitude: null,
      }),
    ],
  });
  await page.goto('/guardian/routes');

  await expect(page.getByTestId('guardian-student-bus-card')).toHaveCount(2);
  await expect(page.getByTestId('guardian-routes-refresh-button')).toBeHidden();
  await expect(page.locator('[data-ui="app-bar"]')).toHaveCSS('position', 'fixed');
  await expect(page.locator('[data-ui="app-bar"]')).toHaveCSS('top', '0px');
  await expect(page.getByTestId('native-bottom-navigation')).toHaveCSS('position', 'fixed');
  const bus42Card = page.getByRole('link', { name: 'View details for Bus 42' });
  await expect(bus42Card.getByText('Avery Johnson')).toBeVisible();
  await expect(bus42Card.getByText('Morgan Johnson')).toBeVisible();
  await expect(bus42Card.getByText('License plate')).toHaveCount(0);
  await expect(bus42Card.getByText('View bus details')).toHaveCount(0);
  await expect(bus42Card.locator('[data-ui="guardian-icon-tile"]')).toHaveCSS(
    'background-color',
    'rgb(23, 43, 58)',
  );
  await page.screenshot({ path: testInfo.outputPath('guardian-buses.png'), fullPage: true });
  await bus42Card.click();

  await expect(page.getByRole('heading', { name: 'Bus 42', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cedar School Line' })).toBeVisible();
  const serviceLine = page.locator('[data-ui="guardian-service-line"]');
  await expect(page.locator('[data-ui="guardian-service-line-card"]')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(serviceLine.locator('.guardian-service-line__point')).toHaveCount(3);
  await expect(serviceLine.getByText('North Terminal')).toBeVisible();
  await expect(serviceLine.getByText('Cedar Avenue')).toBeVisible();
  await expect(serviceLine.getByText('Riverside School')).toBeVisible();
  await expect(serviceLine.getByText(/Start/)).toBeVisible();
  await expect(serviceLine.getByText(/End/)).toBeVisible();
  await expect(page.getByTestId('guardian-service-line-bus')).toBeVisible();
  await expect(page.getByText('Next stop: Cedar Avenue')).toBeVisible();
  await expect(serviceLine.getByText('Passed')).toBeVisible();
  await expect(serviceLine.getByText('6–9 min')).toBeVisible();
  await expect(serviceLine.getByText('19–26 min')).toBeVisible();
  await expect(serviceLine.getByText('Planned 8:12 AM')).toBeVisible();
  await expect(
    serviceLine.locator('.guardian-service-line__point[data-state="next"]'),
  ).toContainText('Cedar Avenue');
  const busMarker = page.getByTestId('guardian-service-line-bus');
  await expect(busMarker).toHaveAttribute('style', /25%/);
  await page.waitForTimeout(600);
  await expect(busMarker).toHaveAttribute('style', /25%/);
  guardianMock.setServiceLines([
    guardianBusServiceLine({
      progressPercent: 75,
      progressSource: 'stop_sequence',
      nextStopName: 'Riverside School',
    }),
  ]);
  await page.reload();
  await expect(page.getByTestId('guardian-service-line-bus')).toHaveAttribute('style', /75%/);
  await expect(page.getByText('Position estimated from the ordered stops.')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page
        .getByTestId('guardian-service-line-bus')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration)),
    )
    .toBeLessThan(0.001);
  await page.locator('[data-ui="guardian-service-line-card"]').screenshot({
    path: testInfo.outputPath('guardian-service-line.png'),
  });
  await expect(page.getByRole('link', { name: 'See live map' })).toHaveAttribute(
    'href',
    '/guardian/live-map?bus=42',
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('guardian-bus-details.png'), fullPage: true });

  await page.goto('/guardian/buses/27');
  const inactiveStatus = page
    .locator('[data-ui="guardian-bus-detail-hero"]')
    .getByText('Inactive', { exact: true });
  await expect(inactiveStatus).toHaveCSS('color', 'rgb(71, 85, 105)');
  await expect(inactiveStatus.locator('> span')).toHaveCSS(
    'background-color',
    'rgb(100, 116, 139)',
  );

  guardianMock.setServiceLines([
    guardianBusServiceLine({
      busNumber: '27',
      licensePlate: 'TEST-27',
      tripStatus: 'inactive',
      locationState: 'inactive',
      latitude: null,
      longitude: null,
      locationRecordedAt: null,
      progressPercent: null,
      progressSource: null,
      nextStopName: null,
      nextStopOrder: null,
      etaUpdatedAt: null,
      stops: [
        {
          name: 'Hill School',
          order: 1,
          latitude: null,
          longitude: null,
          plannedArrivalTime: null,
          serviceState: 'unavailable',
          etaStatus: 'unavailable',
          etaMinMinutes: null,
          etaMaxMinutes: null,
          etaLabel: 'ETA unavailable',
        },
      ],
    }),
  ]);
  await page.reload();
  await expect(page.getByText('ETA unavailable', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Planned time unavailable', { exact: true })).toBeVisible();
});

test('guardian bus detail remains useful while the route contract is unavailable', async ({
  page,
}) => {
  await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
    failServiceLines: true,
  });
  await page.goto('/guardian/buses/42');

  await expect(page.getByRole('heading', { name: 'Bus 42', level: 1 })).toBeVisible();
  await expect(page.getByText('Route line is not available')).toBeVisible();
  await expect(page.getByText('private backend error')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'See live map' })).toBeVisible();
});

test('mobile notification settings use Cool Cloud cards and autosave the channel matrix', async ({
  page,
}, testInfo) => {
  const mock = await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
  });
  await page.goto('/notifications/settings');

  await expect(
    page.getByRole('heading', { name: 'Notification settings', level: 1 }),
  ).toBeVisible();
  const push = page.getByRole('switch', { name: 'Push notifications' });
  const email = page.getByRole('switch', { name: 'Email notifications' });
  await expect(push).toBeVisible();
  await expect(email).toBeVisible();
  await expect(page.getByText('Alert types', { exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="notification-alert-row"]')).toHaveCount(3);
  for (const label of ['Pickup & drop-off', 'Trip updates', 'Operational alerts']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `${label} push` })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `${label} email` })).toBeVisible();
  }
  await expect(page.getByText('Lock-screen privacy', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save notification settings' })).toHaveCount(0);
  await expect(page.locator('[data-ui="dashboard-shell"]')).toHaveCSS(
    'background-color',
    'rgb(242, 246, 247)',
  );
  await expect(
    page.locator('[data-ui="notification-delivery-cards"] [data-ui="card"]').first(),
  ).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expectTouchTargets(page.locator('[data-ui="notification-channel-control"]'));
  await expectTouchTargets(page.locator('[data-ui="notification-alert-channel-control"]'));
  await email.check();
  await expect(email).toBeChecked();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Saved');
  const pickupEmail = page.getByRole('checkbox', { name: 'Pickup & drop-off email' });
  await pickupEmail.check();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(2);
  await push.uncheck();
  await expect(push).not.toBeChecked();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(3);
  await expect(page.getByRole('checkbox', { name: 'Trip updates push' })).toBeChecked();
  await expect(page.getByRole('status')).toHaveText('Saved');
  mock.setDeliveryPreferenceSaveFailure(true);
  const tripEmail = page.getByRole('checkbox', { name: 'Trip updates email' });
  await tripEmail.check();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(4);
  await expect(tripEmail).not.toBeChecked();
  await expect(page.getByText('Preference save failed', { exact: true })).toBeVisible();
  mock.setDeliveryPreferenceSaveFailure(false);
  await push.click();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(5);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const settingsTab = page
    .getByTestId('native-bottom-navigation')
    .getByRole('link', { name: 'Settings' });
  await expect(settingsTab).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByTestId('native-bottom-navigation').getByRole('link', { name: 'Updates' }),
  ).not.toHaveAttribute('aria-current', 'page');

  await expect(page.getByText('Registered Android devices', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Quiet hours', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Timezone override', { exact: true })).toHaveCount(0);
  expect(mock.getDeviceCallCount()).toBe(0);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('notification-settings.png'), fullPage: true });

  await page.locator('[data-ui="dropdown"] > button').click();
  const profileMenu = page.locator('[data-ui="dropdown-panel"]');
  await expect(profileMenu).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: testInfo.outputPath('guardian-profile-menu.png') });
  await page.getByRole('menuitem', { name: 'Privacy & account' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy and account', level: 1 })).toBeVisible();
  await expect(page.locator('[data-ui="guardian-account-card"]').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.screenshot({ path: testInfo.outputPath('guardian-account.png'), fullPage: true });
});

test('Android push permission denial rolls back and offers system settings recovery', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __openedNotificationSettings: 0,
      SafeBusNativePush: {
        available: true,
        getPermissionState: async () => 'denied',
        enable: async () => 'denied',
        deactivate: async () => undefined,
        refresh: async () => undefined,
        openSystemSettings: async () => {
          (
            window as Window & { __openedNotificationSettings: number }
          ).__openedNotificationSettings += 1;
        },
      },
    });
  });
  const mock = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.goto('/notifications/settings');

  const push = page.getByRole('switch', { name: 'Push notifications' });
  await push.uncheck();
  await expect.poll(() => mock.getDeliveryPreferenceSaveCount()).toBe(1);
  await push.click();
  await expect(push).not.toBeChecked();
  await expect(page.getByRole('status')).toHaveText(
    'Push permission is turned off in Android settings.',
  );
  const recovery = page.getByRole('button', { name: 'Open Android notification settings' });
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __openedNotificationSettings: number })
            .__openedNotificationSettings,
      ),
    )
    .toBe(1);
});

test('guardian updates prioritize compact filters and alert cards', async ({ page }, testInfo) => {
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  const inbox = await installNotificationInboxMock(page);
  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Updates', level: 1 })).toBeVisible();
  await expect(page.getByText('1 new', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeVisible();
  const filters = page.locator('[data-ui="notification-filters"]');
  const notification = page.locator('[data-ui="notification-card"]');
  await expect(page.locator('[data-ui="notification-inbox-page"]')).toHaveCSS(
    'background-color',
    'rgb(242, 246, 247)',
  );
  await expect(filters).toHaveCSS('margin-bottom', '16px');
  await expect(page.getByRole('button', { name: 'All 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'All 1' })).toHaveCSS(
    'background-color',
    'rgb(35, 92, 120)',
  );
  await expect(page.getByRole('button', { name: 'Unread 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Service alerts' })).toBeVisible();
  await expect(filters.getByRole('combobox')).toHaveCount(0);
  await expect(filters.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('[data-ui="notification-list"]')).toHaveCSS('gap', '16px');
  await expect(notification).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(notification).toHaveCSS('padding', '16px');
  await expect(notification.locator('[data-ui="notification-unread-dot"]')).toHaveCSS(
    'background-color',
    'rgb(207, 89, 99)',
  );
  await expect(
    notification.getByRole('button', { name: 'Open notification: Trip cancelled' }),
  ).toHaveText('View update');

  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect.poll(() => inbox.getMarkAllReadCallCount()).toBe(1);
  await expect(page.getByText('1 new', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  await expect(notification.getByText('Read', { exact: true })).toBeVisible();
  await expect(notification.locator('[data-ui="notification-unread-dot"]')).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('guardian-updates.png'), fullPage: true });
});

test('driver updates reuse the compact inbox with assignment-only alerts', async ({
  page,
}, testInfo) => {
  await installSupabaseMock(page);
  await installNotificationInboxMock(page, { driver: true });
  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Updates', level: 1 })).toBeVisible();
  const filters = page.locator('[data-ui="notification-filters"]');
  const notification = page.locator('[data-ui="notification-card"]');
  await expect(filters.getByRole('combobox')).toHaveCount(0);
  await expect(filters.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All 1' })).toHaveCSS(
    'background-color',
    'rgb(35, 92, 120)',
  );
  await expect(page.getByRole('button', { name: 'Unread 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assignment alerts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Service alerts' })).toHaveCount(0);
  await expect(filters).toHaveCSS('margin-bottom', '16px');
  await expect(filters.locator('[data-ui="notification-filter-controls"]')).toHaveCSS(
    'gap',
    '8px',
  );
  await expect(page.locator('[data-ui="notification-list"]')).toHaveCSS('gap', '16px');
  await expect(notification).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(notification).toHaveCSS('padding', '16px');
  await expect(notification.getByText('Assignment changed', { exact: true })).toHaveCount(2);
  await expect(
    notification.getByRole('button', { name: 'Open notification: Assignment changed' }),
  ).toHaveText('View update');
  await expect(page.locator('[data-ui="avatar"]')).toHaveCSS(
    'background-color',
    'rgb(35, 92, 120)',
  );
  await expect(page.locator('[data-ui="avatar"]')).toHaveAttribute('data-tone', 'brand');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('driver-updates.png'), fullPage: true });
});

test('driver active-trip shell keeps daily actions touch friendly', async ({ page }, testInfo) => {
  await installSupabaseMock(page, { withActiveTrip: true, withCompletedTrips: true });
  await page.goto('/driver');

  await expect(page.getByRole('heading', { name: 'Bus 12', level: 1 })).toBeVisible();
  await expectMaterialBrand(page);

  const tabs = page.getByTestId('native-bottom-navigation').getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.filter({ hasText: 'Scan' })).toHaveAttribute('aria-current', 'page');

  const actionableButtons = page.locator(
    '[data-testid="driver-active-trip-only"] [data-ui="button"]',
  );
  await expectTouchTargets(actionableButtons);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('driver-active-trip.png') });
});

test('driver support page shows one resolved support contact', async ({ page }) => {
  await installSupabaseMock(page, {
    supportDirectory: {
      platform: null,
      tenant: {
        displayName: 'Prairie Schools Transportation',
        email: 'transport@example.test',
        phone: '403-555-0123',
        websiteUrl: 'https://example.test/support',
        supportHours: 'Monday–Friday, 8:00 AM–4:30 PM MT',
        instructions: 'Include your bus number when asking for help.',
        updatedAt: '2026-09-22T12:00:00Z',
      },
    },
  });
  await page.goto('/support');
  await expect(page.getByRole('heading', { name: 'Support', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Support contact' })).toBeVisible();
  await expect(page.getByText('Prairie Schools Transportation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'transport@example.test' })).toHaveAttribute(
    'href',
    'mailto:transport@example.test',
  );
  await expect(page.getByText('BusSafe platform support')).toHaveCount(0);
  await expect(page.getByTestId('support-contact-card')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('[data-ui="avatar"]')).toHaveCSS(
    'background-color',
    'rgb(35, 92, 120)',
  );

  await page.goto('/account');
  const accountCards = page.locator('[data-ui="guardian-account-card"]');
  await expect(accountCards).toHaveCount(3);
  await expect(accountCards.first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(accountCards.first().locator('[data-ui="guardian-icon-tile"]')).toHaveCSS(
    'background-color',
    'rgb(221, 242, 244)',
  );
});

test('driver support page avoids a configuration dead end when no contact is returned', async ({
  page,
}) => {
  await installSupabaseMock(page);
  await page.goto('/support');

  await expect(page.getByText('Support contact is not configured yet')).toHaveCount(0);
  await expect(page.getByText('Contact your transportation administrator')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View contact instructions' })).toHaveAttribute(
    'href',
    '/privacy#contact',
  );
  await expect(page.locator('[data-ui-state="data-state"]')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
});

test('driver account menu exposes existing secondary destinations', async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto('/driver');

  await page.locator('button[aria-haspopup="menu"]').click();
  await expect(page.getByRole('menuitem', { name: 'Driver settings' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Support' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Privacy & account' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});

test('driver settings combines assignment delivery and device guidance', async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto('/driver/settings');

  await expect(page.getByRole('heading', { name: 'Driver settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Push notifications' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Email notifications' })).toBeVisible();
  await expect(page.getByText('Assignment alerts', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Assignment alerts push' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Assignment alerts email' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Location access' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Driver safety' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View notifications' })).toHaveAttribute(
    'href',
    '/notifications',
  );

  const tabs = page.getByTestId('native-bottom-navigation').getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.last()).toContainText('Settings');
  await expect(tabs.last()).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-ui="avatar"]')).toHaveCSS(
    'background-color',
    'rgb(35, 92, 120)',
  );
  await expect(page.locator('[data-ui="avatar"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expectTouchTargets(page.locator('[data-ui="notification-channel-control"]'));
  await expectNoHorizontalOverflow(page);
});

test('driver notification settings route redirects to the combined settings page', async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto('/notifications/settings');
  await expect(page).toHaveURL('/driver/settings');
  await expect(page.getByRole('heading', { name: 'Driver settings', level: 1 })).toBeVisible();
});

test('landscape layout retains navigation and horizontal containment', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await installSupabaseMock(page, { withCompletedTrips: true });
  await page.goto('/driver/history');

  await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Completed trips', level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('login uses the mobile brand and accessible control sizing', async ({ page }, testInfo) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('.supabase.co')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expectMaterialBrand(page);
  await expect(page.getByRole('button', { name: 'Back to site' })).toBeHidden();

  const controls = page.locator(
    '[data-ui="login-card"] input, [data-ui="login-card"] [data-ui="button"]',
  );
  await expectTouchTargets(controls);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('login.png') });
});
