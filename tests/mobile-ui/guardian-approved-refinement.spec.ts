import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
  GUARDIAN_STUDENT_ID,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectUsableMobileLayout } from '../smoke/fixtures/responsive';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';
const second = '44444444-4444-4444-4444-444444444444';
const longStop = 'North Terminal — Community Centre entrance';
async function setup(page: import('@playwright/test').Page, stale = false) {
  await installLocalOnlyBoundary(page);
  const now = new Date().toISOString();
  return installGuardianVisibilityMock(page, {
    rows: [
      guardianVisibilityRow({
        location_recorded_at: stale ? new Date(Date.now() - 480000).toISOString() : now,
        location_state: stale ? 'stale' : 'fresh',
        location_age_seconds: stale ? 480 : 0,
      }),
      guardianVisibilityRow({
        student_id: second,
        student_name: 'Morgan Johnson',
        student_grade: '2',
        student_trip_status: 'picked_up',
        location_recorded_at: stale ? new Date(Date.now() - 480000).toISOString() : now,
        location_state: stale ? 'stale' : 'fresh',
      }),
    ],
    studentStops: [
      {
        student_id: GUARDIAN_STUDENT_ID,
        bus_number: '42',
        trip_name: 'Cedar morning run',
        direction: 'forward',
        pickup_stop_name: longStop,
        dropoff_stop_name: 'Riverside School',
        seat_number: 12,
      },
      {
        student_id: GUARDIAN_STUDENT_ID,
        bus_number: '42',
        trip_name: 'Cedar afternoon run',
        direction: 'reverse',
        pickup_stop_name: 'Riverside School',
        dropoff_stop_name: longStop,
        seat_number: null,
      },
      {
        student_id: second,
        bus_number: '42',
        trip_name: 'Cedar morning run',
        direction: 'forward',
        pickup_stop_name: 'North Terminal',
        dropoff_stop_name: 'Riverside School',
        seat_number: null,
      },
    ],
  });
}
async function dismissNotice(page: import('@playwright/test').Page) {
  const notice = page.getByRole('button', { name: 'I understand', exact: true });
  if (await notice.isVisible()) await notice.click();
}
for (const theme of ['light', 'dark']) {
  test(`approved Home and Buses, populated assignments in ${theme}`, async ({ page }, info) => {
    await page.addInitScript((t) => localStorage.setItem('safebus.theme', t), theme);
    await setup(page);
    await page.goto('/parent');
    await expect(page.getByTestId('guardian-home-bus-card')).toBeVisible();
    await dismissNotice(page);
    await expect(page.getByTestId('guardian-home-last-checked')).toHaveCount(0);
    await expect(page.getByText('View bus details', { exact: true })).toHaveCount(0);
    await expectUsableMobileLayout(page);
    await expectNoWcagAaViolations(page, `refined home ${theme}`);
    await page.screenshot({ path: info.outputPath(`home-${theme}.png`), fullPage: true });
    await page.getByRole('link', { name: /Pickup and drop-off status for Morgan Johnson/ }).click();
    await expect(page.getByTestId('guardian-events-student-card')).toHaveCount(1);
    await expect(page.getByTestId('guardian-events-student-card')).toContainText('Morgan Johnson');
    await expect(page.getByTestId('guardian-events-list')).not.toContainText('Avery Johnson');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL('/parent');
    await page
      .getByTestId('native-bottom-navigation')
      .getByRole('link', { name: 'Buses', exact: true })
      .click();
    await expect(page.getByText('Cedar afternoon run')).toBeVisible();
    await expect(page.getByTestId('guardian-assigned-student')).toHaveCount(2);
    await expect(
      page
        .getByTestId('guardian-assigned-student')
        .first()
        .locator('dl')
        .last()
        .locator('dd')
        .last(),
    ).toHaveText('Not assigned');
    await expect(page.getByText('View bus details', { exact: true })).toHaveCount(0);
    await expectUsableMobileLayout(page);
    await expectNoWcagAaViolations(page, `refined buses ${theme}`);
    await page.screenshot({ path: info.outputPath(`buses-${theme}.png`) });
    await page.getByTestId('guardian-assigned-student').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`buses-scrolled-${theme}.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 320, height: 700 });
    await expectUsableMobileLayout(page);
    await page.screenshot({ path: info.outputPath(`buses-narrow-${theme}.png`), fullPage: true });
  });
}
test('stale location disables map; icon and downward gesture refresh', async ({ page }, info) => {
  const fixture = await setup(page, true);
  await page.goto('/parent');
  await expect(page.getByTestId('guardian-home-bus-card')).toBeVisible();
  await dismissNotice(page);
  await expect(
    page.getByRole('button', { name: 'Location unavailable', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('link', { name: 'View live map' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Page options' })).toHaveCount(0);
  const refreshIcon = page.getByRole('button', { name: 'Refresh', exact: true });
  const target = await refreshIcon.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(48);
  expect(target?.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: info.outputPath('home-stale-refresh-icon.png'), fullPage: true });
  const before = fixture.getCallCount();
  await refreshIcon.click();
  await expect.poll(() => fixture.getCallCount()).toBeGreaterThan(before);
  await expect(page.getByText('Refreshing…', { exact: true })).toHaveCount(0);
  const surface = page.locator('[data-ui="guardian-refresh-surface"]');
  const afterIcon = fixture.getCallCount();
  await surface.dispatchEvent('touchstart', {
    touches: [{ identifier: 0, clientX: 100, clientY: 100 }],
  });
  await surface.dispatchEvent('touchmove', {
    touches: [{ identifier: 0, clientX: 100, clientY: 200 }],
  });
  await expect(page.getByText('Release to refresh', { exact: true })).toBeVisible();
  await surface.dispatchEvent('touchend', { touches: [] });
  await expect.poll(() => fixture.getCallCount()).toBeGreaterThan(afterIcon);
});

test('error, unassigned and unavailable stops remain distinct', async ({ page }, info) => {
  const fixture = await setup(page);
  fixture.setFail(true);
  await page.goto('/parent');
  await expect(page.getByText('We could not load your buses.', { exact: true })).toBeVisible();
  await dismissNotice(page);
  await page.screenshot({ path: info.outputPath('home-error.png'), fullPage: true });
  fixture.setFail(false);
  fixture.setRows([
    guardianVisibilityRow({
      assignment_state: 'unassigned',
      bus_number: null,
      has_active_trip: false,
      location_state: 'inactive',
      location_recorded_at: null,
    }),
  ]);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No bus assigned yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: /View bus details/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('home-unassigned.png'), fullPage: true });
  fixture.setRows([guardianVisibilityRow()]);
  await page.route('**/rest/v1/rpc/get_guardian_student_stops_v2', (route) =>
    route.fulfill({ status: 503, json: { message: 'unavailable' } }),
  );
  await page.goto('/guardian/routes');
  await expect(page.getByText('Stop information is unavailable right now.')).toBeVisible();
  await expect(page.getByText('Not assigned', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('buses-stops-unavailable.png'), fullPage: true });
});
