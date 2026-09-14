import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';

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
  const presentation = await mark.evaluate((element) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector('svg');
    return {
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      iconDisplay: icon ? getComputedStyle(icon).display : null,
    };
  });
  expect(presentation.backgroundImage).toContain('safebus-master-mark');
  expect(presentation.backgroundColor).toBe('rgb(11, 47, 91)');
  expect(presentation.iconDisplay).toBe('none');
}

test('guardian shell uses the branded Material mobile treatment', async ({ page }, testInfo) => {
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.goto('/parent');

  await expect(page.getByRole('heading', { name: 'My Buses', level: 1 })).toBeVisible();
  await expectMaterialBrand(page);
  await expect(page.getByText('Track the assigned bus during an active school run.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bus number and license plate' })).toHaveCount(0);
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  const tabs = page.getByTestId('native-bottom-navigation').getByRole('link');
  await expect(tabs).toHaveCount(5);
  await expect(tabs.filter({ hasText: 'Home' })).toHaveAttribute('aria-current', 'page');

  const tabHeights = await tabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(tabHeights.every((height) => height >= 48)).toBe(true);

  const liveMapAction = page.getByRole('link', { name: 'View live map' });
  const actionSize = await liveMapAction.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(actionSize.height).toBeGreaterThanOrEqual(48);
  expect(actionSize.width).toBeGreaterThanOrEqual(48);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('guardian-home.png') });
});

test('guardian buses group students and open a clean bus detail view', async ({ page }, testInfo) => {
  await installGuardianVisibilityMock(page, {
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
  await expect(page.getByText(/Bus is currently between North Terminal and Cedar Avenue/)).toBeVisible();
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
  await expect(inverseStatus.locator('> span')).toHaveCSS(
    'background-color',
    'rgb(241, 245, 249)',
  );
});

test('guardian bus detail remains useful while the route contract is unavailable', async ({ page }) => {
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

  await expect(page.getByRole('heading', { name: 'Notification settings', level: 1 })).toBeVisible();
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

  const actionableButtons = page.locator('[data-testid="driver-active-trip-only"] [data-ui="button"]');
  await expect(actionableButtons.first()).toBeVisible();
  // The entrance translation can briefly produce fractional bounding boxes.
  // Retry the measurement until layout settles, retaining the 48px minimum.
  await expect.poll(async () =>
    actionableButtons.evaluateAll((elements) =>
      elements.length === 0
        ? 0
        : Math.min(...elements.map((element) => element.getBoundingClientRect().height)),
    ),
  ).toBeGreaterThanOrEqual(48);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('driver-active-trip.png') });
});

test('driver account menu exposes existing secondary destinations', async ({ page }) => {
  await installSupabaseMock(page);
  await page.goto('/driver');

  await page.locator('button[aria-haspopup="menu"]').click();
  await expect(page.getByRole('menuitem', { name: 'Driver settings' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
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

  const controls = page.locator('[data-ui="login-card"] input, [data-ui="login-card"] [data-ui="button"]');
  const heights = await controls.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 48)).toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('login.png') });
});
