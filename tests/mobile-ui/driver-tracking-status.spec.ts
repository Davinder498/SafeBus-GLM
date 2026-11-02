import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import type { NativeTrackingStatus } from '../../apps/web/src/types/nativeTracking';

type FixtureWindow = Window & {
  trackingFixture: { status: NativeTrackingStatus; resumes: number; reads: number; fail: boolean };
};
const now = new Date('2026-11-01T09:00:00Z');
const current: NativeTrackingStatus = {
  statusVersion: 2,
  configured: true,
  collecting: true,
  connected: true,
  queuedEvents: 0,
  lastAcceptedAt: now.toISOString(),
};
test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});
test.setTimeout(60_000);
async function install(page: Page, status: NativeTrackingStatus, activeTrip = true) {
  await page.clock.install({ time: now });
  await installSupabaseMock(page, { withActiveTrip: activeTrip });
  await page.addInitScript((initial) => {
    const fixture = { status: initial, resumes: 0, reads: 0, fail: false };
    (window as FixtureWindow).trackingFixture = fixture;
    window.SafeBusNativeTracking = {
      getStatus: async () => {
        fixture.reads++;
        if (fixture.fail) throw new Error('bridge unavailable');
        return { ...fixture.status };
      },
      resume: async () => {
        fixture.resumes++;
        return { ...fixture.status, collecting: true };
      },
      pause: async () => {
        fixture.status.collecting = false;
        return { ...fixture.status };
      },
      stop: async () => {
        fixture.status.collecting = false;
        return { ...fixture.status };
      },
      activate: async () => undefined,
      prepare: async () => ({ locationPermission: 'always', notificationPermission: 'granted' }),
      openAppSettings: async () => undefined,
      openLocationServices: async () => undefined,
    };
  }, status);
  await page.goto('/driver');
  await expect(page.getByTestId('driver-location-panel')).toBeVisible({ timeout: 20_000 });
}
async function poll(page: Page) {
  await page.clock.runFor(10_000);
}
test('a fresh acknowledgement expires without inventing new delivery', async ({ page }) => {
  await install(page, current);
  await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active');
  // Includes the Alberta service date and offset, even across the old runtime DST boundary.
  await expect(page.getByTestId('driver-location-status')).toContainText('-06:00');
  await page.clock.runFor(130_000);
  await expect(page.getByTestId('driver-location-status')).toContainText(
    'Location updates are delayed',
  );
  expect(await page.evaluate(() => (window as FixtureWindow).trackingFixture.resumes)).toBe(0);
});
test('offline stays visible through polling and resumes the truthful status online', async ({
  page,
}) => {
  await install(page, current);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  await poll(page);
  await expect(page.getByTestId('driver-location-status')).toContainText('Offline.');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByTestId('driver-location-status')).toContainText('Location sharing active');
});
test('an ended trip still shows queued recovery without restarting collection', async ({
  page,
}) => {
  await install(
    page,
    { ...current, collecting: false, queuedEvents: null, pendingDelivery: true },
    false,
  );
  await expect(page.getByTestId('driver-location-status')).toContainText(
    'Location collection is off. Queued updates remain',
  );
  await poll(page);
  expect(await page.evaluate(() => (window as FixtureWindow).trackingFixture.resumes)).toBe(0);
  await page.evaluate(() => {
    (window as FixtureWindow).trackingFixture.status.queuedEvents = 0;
    (window as FixtureWindow).trackingFixture.status.pendingDelivery = false;
  });
  await poll(page);
  await expect(page.getByTestId('driver-location-status')).toHaveText(
    'Location collection is off.',
  );
});
test('status errors replace stale success, disclose pending delivery, and recover on retry', async ({
  page,
}) => {
  await install(page, current);
  await page.evaluate(() => {
    (window as FixtureWindow).trackingFixture.fail = true;
  });
  await poll(page);
  await expect(page.getByTestId('driver-location-error')).toContainText('Could not verify');
  await expect(page.getByTestId('driver-location-status')).not.toContainText('sharing active');
  await page.evaluate(() => {
    const fixture = (window as FixtureWindow).trackingFixture;
    fixture.fail = false;
    fixture.status.issue = 'authorization_rejected';
    fixture.status.queuedEvents = 1;
  });
  await poll(page);
  await expect(page.getByTestId('driver-location-error')).toContainText(
    'authorization was rejected',
  );
  await expect(
    page.getByText('Queued location updates remain on this phone.', { exact: true }),
  ).toBeVisible();
});
