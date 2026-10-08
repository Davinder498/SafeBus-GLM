import { expect, test, type Page } from '@playwright/test';
import { installSupabaseMock, MOCK } from '../smoke/fixtures/supabase-mock';
import { createRequire } from 'node:module';
import path from 'node:path';
const requireWeb = createRequire(path.resolve('apps/web/package.json'));

const token = `sbus_qr_v1_${'S'.repeat(43)}`;
async function install(
  page: Page,
  options: {
    refreshFailure?: boolean;
    deniedCamera?: boolean;
    noTrip?: boolean;
    outcome?: string;
    fallbackImage?: string;
  } = {},
) {
  await installSupabaseMock(page, { withActiveTrip: !options.noTrip });
  let status = 'not_picked_up';
  const calls: Record<string, string>[] = [];
  let didRecord = false;
  await page.route('**/rest/v1/rpc/get_driver_active_trip_student_manifest', async (route) => {
    if (options.refreshFailure && didRecord)
      return route.fulfill({ status: 503, body: '{"message":"refresh failure"}' });
    await route.fulfill({
      json: options.noTrip
        ? []
        : [
            {
              active_trip_id: MOCK.tripId,
              student_id: 'aaaaaaaa-0000-0000-0000-000000000001',
              student_display_name: 'Avery Johnson',
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
              student_trip_status: status,
            },
          ],
    });
  });
  await page.route('**/rest/v1/rpc/record_student_qr_event_for_active_trip', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    expect(body.p_driver_trip_id).toBe(MOCK.tripId);
    expect(body.p_qr_token).toBe(token);
    const outcome =
      options.outcome ?? (status === body.p_event_type ? 'already_recorded' : 'recorded');
    if (outcome === 'recorded') status = body.p_event_type;
    didRecord = true;
    await route.fulfill({
      json: [
        {
          student_id: 'aaaaaaaa-0000-0000-0000-000000000001',
          student_display_name: 'Avery Johnson',
          pickup_stop_name: 'Elm',
          dropoff_stop_name: 'School',
          student_trip_status: status,
          outcome,
        },
      ],
    });
  });
  await page.addInitScript(
    ({ value, denied, fallbackImage }) => {
      const runtime = window as unknown as { BarcodeDetector: unknown; __stops: number };
      runtime.__stops = 0;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (denied) throw new DOMException('Denied', 'NotAllowedError');
            if (fallbackImage) {
              const image = new Image();
              image.src = fallbackImage;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              canvas.getContext('2d')?.drawImage(image, 0, 0);
              const stream = canvas.captureStream(15);
              Object.defineProperty(stream, '__canvas', { value: canvas });
              return stream;
            }
            return {
              getTracks: () => [
                {
                  stop: () => {
                    runtime.__stops += 1;
                  },
                },
              ],
            };
          },
        },
      });
      if (!fallbackImage) {
        Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
          configurable: true,
          get: () => 4,
        });
        HTMLMediaElement.prototype.play = async () => undefined;
        Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
          configurable: true,
          get: () => null,
          set: () => undefined,
        });
        runtime.BarcodeDetector = class {
          async detect() {
            return [{ rawValue: value }];
          }
        };
      } else {
        Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
      }
    },
    { value: token, denied: !!options.deniedCamera, fallbackImage: options.fallbackImage },
  );
  return calls;
}

test('driver records selected events, repeated pickup stays pickup, and the mobile scanner fits', async ({
  page,
}) => {
  const calls = await install(page);
  await page.goto('/driver/manifest');
  await page.getByRole('button', { name: 'Open QR scanner' }).click();
  await expect(page.getByTestId('driver-qr-recorded-message')).toHaveText('Pickup recorded.');
  await expect(page.getByRole('radio', { name: 'Pickup', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Scan next' }).click();
  await expect(page.getByTestId('driver-qr-recorded-message')).toContainText(
    'Pickup already recorded.',
  );
  expect(calls.map((call) => call.p_event_type)).toEqual(['picked_up', 'picked_up']);
  await page.getByRole('radio', { name: 'Drop-off', exact: true }).check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByTestId('driver-qr-recorded-message')).toHaveText('Drop-off recorded.');
  expect(calls[2].p_event_type).toBe('dropped_off');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __stops: number }).__stops)).toBe(3);
});
test('recorded scan stays successful when list refresh fails', async ({ page }) => {
  await install(page, { refreshFailure: true });
  await page.goto('/driver/manifest');
  await page.getByRole('button', { name: 'Open QR scanner' }).click();
  await expect(page.getByTestId('driver-qr-recorded-message')).toHaveText('Pickup recorded.');
  await page.getByRole('button', { name: 'Close scanner' }).click();
  await expect(page.getByTestId('driver-manifest-action-message')).toContainText('Scan confirmed.');
  await expect(page.getByRole('button', { name: 'Reload list' })).toBeVisible();
});
test('permission denial offers retry and does not write', async ({ page }) => {
  const calls = await install(page, { deniedCamera: true });
  await page.goto('/driver/manifest');
  await page.getByRole('button', { name: 'Open QR scanner' }).click();
  await expect(page.getByText('Camera permission was denied.', { exact: false })).toBeVisible();
  expect(calls).toHaveLength(0);
});
test('no active trip exposes no scanner', async ({ page }) => {
  await install(page, { noTrip: true });
  await page.goto('/driver/manifest');
  await expect(page.getByTestId('driver-manifest-no-active-trip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open QR scanner' })).toHaveCount(0);
});

test('real ZXing fallback reads a QR from local video frames without native detection', async ({
  page,
}) => {
  const image = await requireWeb('qrcode').toDataURL(token, {
    width: 640,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const calls = await install(page, { fallbackImage: image });
  await page.goto('/driver/manifest');
  await page.getByRole('button', { name: 'Open QR scanner' }).click();
  await expect(page.getByTestId('driver-qr-recorded-message')).toHaveText('Pickup recorded.');
  expect(calls).toHaveLength(1);
  await page.screenshot({ path: '.codex-artifacts/student-qr-mobile.png' });
});
