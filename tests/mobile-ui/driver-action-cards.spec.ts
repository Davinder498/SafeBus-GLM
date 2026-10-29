import { expect, test, type Page } from '@playwright/test';
import { installSupabaseMock, MOCK } from '../smoke/fixtures/supabase-mock';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});
test.setTimeout(60_000);

const exceptions = [
  ['traffic_delay', 'Traffic delay'],
  ['weather_delay', 'Weather delay'],
  ['mechanical_issue', 'Mechanical issue'],
  ['road_closure', 'Road closure'],
  ['missed_stop', 'Missed stop'],
  ['late_arrival', 'Late arrival'],
  ['early_arrival', 'Early arrival'],
  ['student_issue', 'Student boarding issue'],
  ['other_operational', 'Other operational note'],
] as const;

function mutations(page: Page) {
  const writes: Array<{ rpc: string; body: Record<string, unknown> }> = [];
  page.on('request', (request) => {
    const rpc = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    if (
      [
        'record_trip_exception',
        'pause_driver_trip',
        'resume_driver_trip',
        'end_driver_trip',
        'cancel_driver_trip',
        'confirm_pre_trip',
      ].includes(rpc)
    )
      writes.push({ rpc, body: request.postDataJSON() });
  });
  return writes;
}

for (const [value, label] of exceptions) {
  test(`exception card ${value} records only after confirmation`, async ({ page }) => {
    await installSupabaseMock(page, { withActiveTrip: true });
    const writes = mutations(page);
    await page.goto('/driver');
    await page.getByRole('link', { name: 'Record exception', exact: true }).click();
    await expect(page.getByTestId('driver-exception-types').getByRole('button')).toHaveCount(9);
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Bus 12');
    expect(writes).toEqual([]);
    if (value === 'traffic_delay') {
      await dialog.getByLabel(/Short detail/).fill('Held at railway crossing');
    }
    await dialog.getByRole('button', { name: 'Record exception', exact: true }).click();
    await expect(page.getByText('Operational exception recorded.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('driver-active-bus-card')).toBeVisible();
    expect(writes).toEqual([
      {
        rpc: 'record_trip_exception',
        body: {
          p_trip_id: MOCK.tripId,
          p_exception_type: value,
          p_exception_detail: value === 'traffic_delay' ? 'Held at railway crossing' : null,
        },
      },
    ]);
  });
}

test('active bus owns all three entry cards and navigation preserves GPS', async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 51.04, longitude: -114.07 });
  await page.addInitScript(
    (token) => sessionStorage.setItem('safebus.activeBusTrackingToken', token),
    MOCK.trackingToken,
  );
  await installSupabaseMock(page, { withActiveTrip: true, withAssignments: true });
  let locationUpdates = 0;
  page.on('request', (request) => {
    if (request.url().includes('/rpc/update_bus_tracking_location')) locationUpdates += 1;
  });
  await page.goto('/driver');
  const bus = page.getByTestId('driver-active-bus-card');
  await expect(bus.getByRole('heading', { name: 'Bus 12', exact: true })).toBeVisible();
  await expect(bus).toContainText('North Ridge Outbound');
  await expect(bus).toContainText('Service date');
  await expect(bus.getByTestId('driver-location-panel')).toBeVisible();
  await expect(bus.getByRole('link')).toHaveCount(3);
  await expect(page.getByTestId('driver-primary-trip-actions')).toHaveCount(0);
  await expect.poll(() => locationUpdates).toBeGreaterThan(0);
  await bus.getByRole('link', { name: 'Trip actions', exact: true }).click();
  const before = locationUpdates;
  await expect.poll(() => locationUpdates, { timeout: 12_000 }).toBeGreaterThan(before);
  await page.getByRole('link', { name: 'Back to active bus', exact: true }).click();
  await bus.getByRole('link', { name: 'Record exception', exact: true }).click();
  await page.goBack();
  await expect(bus).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('safebus.activeBusTrackingToken'))).toBe(
    MOCK.trackingToken,
  );
  await expect(bus.getByRole('link', { name: 'Pickup & drop-off', exact: true })).toHaveAttribute(
    'href',
    '/driver/pickup-drop-off',
  );
});

test('exception validation and failed saves stay visible and preserve input', async ({ page }) => {
  await installSupabaseMock(page, { withActiveTrip: true });
  let attempts = 0;
  await page.route('**/rpc/record_trip_exception', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      json: { message: 'Could not record the exception. Try again.' },
    });
  });
  await page.goto('/driver/record-exception');
  await page.getByRole('button', { name: 'Weather delay', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const detail = dialog.getByLabel(/Short detail/);
  await expect(detail).toHaveAttribute('maxlength', '280');
  await detail.fill('Student name is private');
  await dialog.getByRole('button', { name: 'Record exception', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('prohibited student information');
  expect(attempts).toBe(0);
  await detail.fill('Heavy snow on route');
  await dialog.getByRole('button', { name: 'Record exception', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not record');
  await expect(detail).toHaveValue('Heavy snow on route');
  expect(attempts).toBe(1);
  await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Weather delay', exact: true })).toBeFocused();
});

test('pending saves cannot be dismissed or submitted twice', async ({ page }) => {
  await installSupabaseMock(page, { withActiveTrip: true });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route('**/rpc/record_trip_exception', async (route) => {
    attempts += 1;
    await gate;
    await route.fulfill({ json: { id: 'exception-id' } });
  });
  await page.goto('/driver/record-exception');
  await page.getByRole('button', { name: 'Traffic delay', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record exception', exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Go back', exact: true })).toBeDisabled();
  await dialog.locator('form').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(attempts).toBe(1);
  release();
  await expect(page.getByText('Operational exception recorded.', { exact: true })).toBeVisible();
});

for (const route of ['/driver/trip-actions', '/driver/record-exception']) {
  test(`${route} rejects a trip that ended after selection`, async ({ page }) => {
    const fixture = await installSupabaseMock(page, { withActiveTrip: true });
    const writes = mutations(page);
    await page.goto(route);
    await page
      .getByRole('button', {
        name: route.endsWith('trip-actions') ? 'Pause trip' : 'Traffic delay',
        exact: true,
      })
      .click();
    fixture.setActiveTrip(null);
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', {
        name: route.endsWith('trip-actions') ? 'Pause trip' : 'Record exception',
        exact: true,
      })
      .click();
    await expect(dialog.getByRole('alert')).toContainText('changed or ended');
    expect(writes).toEqual([]);
    await expect(dialog.locator('button[type=submit]')).toBeDisabled();
    await dialog.getByRole('link', { name: 'Back to active bus' }).click();
    await expect(
      page.getByRole('heading', { name: 'Scan the bus to start', exact: true }),
    ).toBeVisible();
    await page.goto(route);
    await expect(page.getByText('No active bus trip', { exact: true })).toBeVisible();
    await expect(page.locator('[data-ui=driver-action-card]')).toHaveCount(0);
  });
}

test('paused trips can record exceptions and cancellation preserves its reason contract', async ({
  page,
}) => {
  const fixture = await installSupabaseMock(page, { withActiveTrip: true });
  fixture.setTripStatus('paused');
  const writes = mutations(page);
  await page.goto('/driver/record-exception');
  await expect(page.getByTestId('driver-action-trip-context')).toContainText('paused');
  await page.getByRole('button', { name: 'Other operational note', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Record exception', exact: true })
    .click();
  await page.getByRole('link', { name: 'Trip actions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume trip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause trip', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel trip', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Reason/)).toHaveAttribute('maxlength', '120');
  await dialog.getByLabel(/Reason/).fill('Bus removed from service');
  await dialog.getByRole('button', { name: 'Cancel trip', exact: true }).click();
  await expect(
    page.getByText('Trip cancelled and recorded in the audit trail.', { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)).toEqual({
    rpc: 'cancel_driver_trip',
    body: { p_trip_id: MOCK.tripId, p_reason: 'Bus removed from service' },
  });
});

test('trip status changes prevent a stale pause and failed trip actions retain their popup', async ({
  page,
}) => {
  const fixture = await installSupabaseMock(page, { withActiveTrip: true });
  const writes = mutations(page);
  await page.goto('/driver/trip-actions');
  await page.getByRole('button', { name: 'Pause trip', exact: true }).click();
  fixture.setTripStatus('paused');
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Pause trip', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed or ended');
  expect(writes).toEqual([]);
  await dialog.getByRole('link', { name: 'Back to active bus' }).click();
  await page.getByRole('link', { name: 'Trip actions', exact: true }).click();
  await page.route('**/rpc/resume_driver_trip', (route) =>
    route.fulfill({ status: 403, json: { message: 'Only an active driver can resume the trip.' } }),
  );
  await page.getByRole('button', { name: 'Resume trip', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Resume trip', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Resume trip', exact: true })).toBeEnabled();
  await expect(page).toHaveURL('/driver/trip-actions');
  expect(writes).toHaveLength(1);
});

test('switching to another trip after selecting an exception cannot write to the previous trip', async ({
  page,
}) => {
  await installSupabaseMock(page, { withActiveTrip: true });
  const writes = mutations(page);
  await page.goto('/driver/record-exception');
  await page.getByRole('button', { name: 'Traffic delay', exact: true }).click();
  await page.route('**/rest/v1/driver_trips?*', async (route) => {
    const row = { id: '77777777-1111-1111-1111-777777777777', status: 'active' };
    await route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? row : [row],
    });
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record exception', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed or ended');
  expect(writes).toEqual([]);
});

for (const [width, height, theme, zoom] of [
  [320, 700, 'light', false],
  [390, 844, 'dark', false],
  [844, 390, 'light', false],
  [390, 844, 'dark', true],
] as const) {
  test(`cards and confirmation fit ${width}x${height} ${theme} enlarged=${zoom}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => localStorage.setItem('safebus.theme', value), theme);
    await installSupabaseMock(page, { withActiveTrip: true });
    await page.goto('/driver/record-exception');
    if (zoom) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.getByRole('button', { name: 'Other operational note', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('color-scheme', theme);
    await expect(dialog.getByRole('button', { name: 'Go back', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByLabel(/Short detail/)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: 'Record exception', exact: true }),
    ).toBeFocused();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog
      .getByRole('button', { name: 'Record exception', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      dialog.getByRole('button', { name: 'Record exception', exact: true }),
    ).toBeInViewport();
    if (!zoom) await expectNoWcagAaViolations(page, `driver exception ${width} ${theme}`);
    await page.screenshot({ path: info.outputPath('exception-confirmation.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('guardians cannot open either driver action screen', async ({ page }) => {
  await installGuardianVisibilityMock(page);
  const writes = mutations(page);
  for (const path of ['/driver/trip-actions', '/driver/record-exception']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Wrong portal', exact: true })).toBeVisible();
    await expect(page.locator('[data-ui=driver-action-card]')).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});
