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
  await expect(logo).toHaveAttribute('src', /safebus-master-mark.*\.png/);
  await expect(logo).toHaveAttribute('alt', '');
  await expect(mark.locator('svg')).toHaveCount(0);
  await expect(mark).toHaveCSS('background-color', 'rgb(35, 92, 120)');
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
  await expect(homeBusCard).toHaveCSS('background-color', 'rgb(255, 249, 232)');
  await expect(homeBusCard.locator('[data-ui="status-pill"][data-tone="success"]')).toHaveAttribute(
    'data-pulse',
    'true',
  );
  const studentCard = page.getByTestId('guardian-home-student-card');
  await expect(studentCard).toContainText('Avery Johnson');
  await expect(studentCard).toContainText('Bus 42');
  await expect(studentCard).toContainText('Cedar Avenue');
  await expect(studentCard).toContainText('Riverside School');

  const tabs = page.getByTestId('native-bottom-navigation').getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.filter({ hasText: 'Home' })).toHaveAttribute('aria-current', 'page');

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
  await bus42Card.click();

  await expect(page.getByRole('heading', { name: 'Bus 42', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cedar School Line' })).toBeVisible();
  const serviceLine = page.locator('[data-ui="guardian-service-line"]');
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
  const inverseStatus = page
    .locator('[data-ui="guardian-bus-detail-hero"]')
    .getByText('Inactive', { exact: true });
  await expect(inverseStatus).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(inverseStatus.locator('> span')).toHaveCSS('background-color', 'rgb(241, 245, 249)');

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

test('mobile notification settings stay focused and do not request device history', async ({
  page,
}, testInfo) => {
  const mock = await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
  });
  await page.goto('/notifications/settings');

  await expect(
    page.getByRole('heading', { name: 'Notification settings', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Push notifications' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alert types' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lock-screen privacy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save notification settings' })).toBeVisible();

  await expect(page.getByText('Registered Android devices', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Quiet hours', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Timezone override', { exact: true })).toHaveCount(0);
  expect(mock.getDeviceCallCount()).toBe(0);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('notification-settings.png'), fullPage: true });
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

test('driver support page shows only the tenant support contact', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'Tenant administrator support' })).toBeVisible();
  await expect(page.getByText('Prairie Schools Transportation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'transport@example.test' })).toHaveAttribute(
    'href',
    'mailto:transport@example.test',
  );
  await expect(page.getByText('BusSafe platform support')).toHaveCount(0);
});

test('driver account menu exposes existing secondary destinations', async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto('/driver');

  await page.locator('button[aria-haspopup="menu"]').click();
  await expect(page.getByRole('menuitem', { name: 'Driver settings' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Support' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Privacy & account' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
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
