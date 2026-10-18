import { expect, test } from '@playwright/test';
import {
  guardianBusServiceLine,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

for (const direction of ['forward', 'reverse'] as const) {
  test(`guardian service line shows only family stops in ${direction} travel order`, async ({
    page,
  }) => {
    const base = guardianBusServiceLine();
    const stop = (name: string, order: number, pickup: string[] = [], dropoff: string[] = []) => ({
      ...base.stops[1],
      name,
      order,
      pickupStudentNames: pickup,
      dropoffStudentNames: dropoff,
      serviceState: 'upcoming' as const,
    });
    const stops =
      direction === 'forward'
        ? [
            stop('Start depot', 1),
            stop('Other family pickup', 2),
            stop('Shared pickup', 3, ['Avery', 'Morgan']),
            stop('Unrelated school', 4),
            stop('Avery school', 5, [], ['Avery']),
            stop('Morgan school', 6, [], ['Morgan']),
            stop('Final depot', 7),
          ]
        : [
            stop('Start depot', 7),
            stop('Morgan school', 6, ['Morgan']),
            stop('Avery school', 5, ['Avery']),
            stop('Unrelated school', 4),
            stop('Shared drop-off', 3, [], ['Avery', 'Morgan']),
            stop('Other family pickup', 2),
            stop('Final depot', 1),
          ];
    await installGuardianVisibilityMock(page, {
      rows: [
        guardianVisibilityRow(),
        guardianVisibilityRow({
          student_id: '44444444-4444-4444-4444-444444444444',
          student_name: 'Morgan Johnson',
        }),
      ],
      serviceLines: [
        guardianBusServiceLine({
          direction,
          stops,
          progressPosition: 3,
          nextStopName: 'Unrelated school',
        }),
      ],
    });
    await page.goto('/guardian/buses/42');
    const line = page.locator('[data-ui="guardian-service-line"]');
    await expect(line.locator('.guardian-service-line__point')).toHaveCount(4, { timeout: 20_000 });
    expect(
      await line
        .locator('.guardian-service-line__point .font-bold.text-navy-900')
        .allTextContents(),
    ).toEqual(
      direction === 'forward'
        ? ['Start depot', 'Shared pickup', 'Avery school', 'Morgan school']
        : ['Start depot', 'Morgan school', 'Avery school', 'Shared drop-off'],
    );
    for (const name of ['Other family pickup', 'Unrelated school', 'Final depot']) {
      await expect(page.getByText(name, { exact: false })).toHaveCount(0);
    }
    await expect(
      line.getByText(
        direction === 'forward' ? 'Pick up: Avery, Morgan' : 'Drop off: Avery, Morgan',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByTestId('guardian-service-line-bus')).toBeVisible();
    await expect
      .poll(async () => {
        const centers = await line.locator('[data-service-stop-anchor]').evaluateAll((anchors) =>
          anchors.map((anchor) => {
            const rect = anchor.getBoundingClientRect();
            return rect.top + rect.height / 2;
          }),
        );
        const marker = await page.getByTestId('guardian-service-line-bus').boundingBox();
        const lower = direction === 'forward' ? 1 : 2;
        return marker
          ? Math.abs(marker.y + marker.height / 2 - (centers[lower] + centers[lower + 1]) / 2)
          : Infinity;
      })
      .toBeLessThan(1.5);
    const anchors = await line.locator('[data-service-stop-anchor]').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }),
    );
    const track = await line.locator('.guardian-service-line__track').boundingBox();
    expect(track).not.toBeNull();
    expect(Math.abs(track!.y - anchors[0])).toBeLessThan(1.5);
    expect(Math.abs(track!.y + track!.height - anchors.at(-1)!)).toBeLessThan(1.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.codex-artifacts/guardian-family-service-${direction}.png`,
      fullPage: true,
    });
  });
}

test('guardian sees the linked student seat per direction on mobile', async ({ page }) => {
  const row = guardianVisibilityRow();
  await installGuardianVisibilityMock(page, {
    rows: [row],
    studentStops: [
      {
        student_id: row.student_id,
        bus_number: '42',
        trip_name: 'Outbound',
        direction: 'forward',
        pickup_stop_name: 'Elm',
        dropoff_stop_name: 'School',
        seat_number: 12,
      },
      {
        student_id: row.student_id,
        bus_number: '42',
        trip_name: 'Return',
        direction: 'reverse',
        pickup_stop_name: 'School',
        dropoff_stop_name: 'Elm',
        seat_number: null,
      },
    ],
  });
  await page.goto('/parent');
  const card = page.getByTestId('guardian-home-student-card');
  await expect(card).toContainText('Seat 12');
  await expect(card).toContainText('Not assigned');
});

test('guardian navigation opens assigned buses in the mobile app', async ({ page }) => {
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.goto('/parent');
  await expect(page.getByTestId('guardian-home-student-card')).toBeVisible();
  const buses = page
    .getByTestId('native-bottom-navigation')
    .getByRole('link', { name: 'Buses', exact: true });
  await expect(buses).toHaveAttribute('href', '/guardian/routes');
  await buses.click();
  await expect(page).toHaveURL('/guardian/routes');
  await expect(page.getByRole('heading', { name: 'My Buses', level: 1 })).toBeVisible();
  await expect(buses).toHaveAttribute('aria-current', 'page');
});

test('assigned buses show the linked-student response without raw coordinates or list license plates', async ({
  page,
}) => {
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.goto('/guardian/routes');
  const card = page.getByTestId('guardian-student-bus-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Avery Johnson');
  await expect(card).toContainText('Bus 42');
  await expect(page.getByRole('link', { name: 'View details for Bus 42' })).toHaveAttribute(
    'href',
    '/guardian/buses/42',
  );
  await expect(
    page.getByRole('list', { name: 'Assigned students' }).getByRole('listitem'),
  ).toHaveCount(1);
  await expect(page.getByText('51.0447')).toHaveCount(0);
  await expect(page.getByText('-114.0719')).toHaveCount(0);
  await expect(card).not.toContainText('TEST-42');
});

test('assigned buses have a clear empty state when no students are linked', async ({ page }) => {
  await installGuardianVisibilityMock(page, { rows: [] });
  await page.goto('/guardian/routes');
  await expect(page.getByTestId('guardian-routes-empty')).toContainText(
    'No linked students are available yet.',
  );
  await expect(page.getByText('Please contact your school transportation office.')).toBeVisible();
  await expect(page.getByTestId('guardian-student-bus-card')).toHaveCount(0);
  await expect(page.getByTestId('guardian-routes-error')).toHaveCount(0);
});

test('assigned-bus failure is generic, hides student data and recovers through Try again', async ({
  page,
}) => {
  const rawError =
    'permission denied for function get_guardian_bus_visibility_v2; private-request-123';
  const fixture = await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
    fail: true,
    rawError,
  });
  await page.goto('/guardian/routes');
  await expect(page.getByTestId('guardian-routes-error')).toContainText(
    'We could not load your bus information.',
  );
  await expect(page.getByTestId('guardian-student-bus-card')).toHaveCount(0);
  await expect(page.getByText('Avery Johnson')).toHaveCount(0);
  await expect(page.getByText(rawError)).toHaveCount(0);
  fixture.setFail(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('guardian-student-bus-card')).toContainText('Avery Johnson');
  await expect(page.getByTestId('guardian-routes-error')).toHaveCount(0);
  expect(fixture.getCallCount()).toBeGreaterThanOrEqual(2);
});

test('logged-out users cannot fetch assigned-bus data from a deep link', async ({ page }) => {
  let visibilityRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/rpc/get_guardian_bus_visibility_v2')) visibilityRequests += 1;
  });
  await page.goto('/guardian/routes');
  await expect(page.getByRole('heading', { name: 'Sign in required', level: 1 })).toBeVisible();
  await expect(page.getByTestId('guardian-student-bus-card')).toHaveCount(0);
  expect(visibilityRequests).toBe(0);
});

test('NULL-school buses and routes retain the scan-only driver start surface', async ({ page }) => {
  await installSupabaseMock(page, { withAssignments: true });
  let schoolRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/rest/v1/schools') schoolRequests += 1;
  });
  await page.goto('/driver');
  await expect(
    page.getByRole('heading', { name: 'Scan the bus to start', level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId('driver-planned-assignments')).toContainText(
    'North Ridge Outbound',
  );
  await expect(page.getByTestId('driver-scan-bus-qr')).toBeEnabled();
  await expect(page.getByLabel('School', { exact: true })).toHaveCount(0);
  expect(schoolRequests).toBe(0);
});
