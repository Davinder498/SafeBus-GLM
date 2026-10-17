import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

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
