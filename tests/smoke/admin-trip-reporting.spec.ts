import { expect, test, type Page } from '@playwright/test';
import { installTripOperationsMock, tripId } from './fixtures/admin-trip-operations';
import { ADMIN_IDS } from './fixtures/admin-workflow';
import { expectNoWcagAaViolations } from './fixtures/accessibility';

async function installEvidence(
  page: Page,
  role: 'tenant_admin' | 'transportation_admin' = 'tenant_admin',
) {
  const controls = await installTripOperationsMock(page, undefined, role);
  const evidence = { requests: [] as URL[], fail: false, empty: false, delay: 0 };
  for (const table of ['trip_exceptions', 'trip_operational_statuses'])
    await page.route(`**/rest/v1/${table}?*`, async (route) => {
      const url = new URL(route.request().url());
      evidence.requests.push(url);
      if (evidence.delay) await new Promise((resolve) => setTimeout(resolve, evidence.delay));
      if (evidence.fail) return route.fulfill({ status: 403, json: { code: '42501' } });
      const dispatch = table === 'trip_operational_statuses';
      const start = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 25);
      const rows = evidence.empty
        ? []
        : Array.from({ length: Math.min(limit, 60 - start) }, (_, i) => ({
            id: tripId(800 + start + i),
            tenant_id: ADMIN_IDS.tenant,
            driver_trip_id: tripId(1),
            exception_type: (url.searchParams.get('exception_type') ?? 'eq.weather_delay').slice(3),
            occurred_at: '2026-11-02T14:00:00Z',
            operational_status:
              dispatch && url.searchParams.get('operational_status') === 'in.(missing)'
                ? 'missing'
                : 'late',
            reason_code: 'weather',
            set_at: '2026-11-02T14:10:00Z',
            trip: {
              id: tripId(1),
              tenant_id: ADMIN_IDS.tenant,
              route_id: ADMIN_IDS.route,
              service_date: '2026-10-28',
              status: 'completed',
              started_at: '2026-10-28T14:00:00Z',
              ended_at: '2026-10-28T15:00:00Z',
              trip_name_snapshot: 'Recorded trip',
              bus_number_snapshot: 'Recorded bus',
              route: {
                tenant_id: ADMIN_IDS.tenant,
                route_name: 'Prairie route',
                route_code: 'PR1',
              },
              pattern: {
                tenant_id: ADMIN_IDS.tenant,
                route_id: ADMIN_IDS.route,
                display_name: 'Current pattern',
                direction: 'forward',
              },
              bus: { tenant_id: ADMIN_IDS.tenant, bus_number: '12' },
              driver: {
                tenant_id: ADMIN_IDS.tenant,
                profile: { tenant_id: ADMIN_IDS.tenant, full_name: 'Alex Driver' },
              },
            },
          }));
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': evidence.empty ? '*/0' : `${start}-${start + rows.length - 1}/60`,
        },
        json: rows,
      });
    });
  return { controls, evidence };
}

for (const role of ['tenant_admin', 'transportation_admin'] as const)
  test(`${role} investigates bounded recorded evidence and returns to filters`, async ({
    page,
  }, testInfo) => {
    const { evidence } = await installEvidence(page, role);
    await page.goto('/admin/trips');
    await page.getByRole('button', { name: 'Driver exceptions', exact: true }).click();
    const table = page.getByTestId('trip-evidence-table');
    await expect(table.locator('tbody tr')).toHaveCount(25);
    await expect(table.locator('tbody tr').first()).toContainText('2026-11-02 8:00 AM UTC-06:00');
    await expect(table.locator('tbody tr').first()).toContainText('Recorded bus');
    await expect(page.getByTestId('admin-pagination')).toContainText('of 60');
    await page.screenshot({ path: testInfo.outputPath('driver-exceptions.png'), fullPage: true });
    await expectNoWcagAaViolations(page, 'Trip reporting exceptions');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByTestId('admin-pagination')).toContainText('26-50');
    expect(evidence.requests.at(-1)?.searchParams.get('offset')).toBe('25');
    await page.getByLabel('Exception category', { exact: true }).selectOption('road_closure');
    await expect(table.locator('tbody tr').first()).toContainText('Road closure');
    expect(evidence.requests.at(-1)?.searchParams.get('exception_type')).toBe('eq.road_closure');
    expect(evidence.requests.at(-1)?.searchParams.get('tenant_id')).toBe(`eq.${ADMIN_IDS.tenant}`);
    await table
      .getByRole('link', { name: /View trip/ })
      .first()
      .click();
    await expect(page.getByText(/historical planned times were not saved/)).toBeVisible();
    await expect(page.getByText('Actual stop arrival: Not recorded')).toHaveCount(2);
    await page.getByRole('link', { name: /Back/ }).click();
    await expect(page.getByLabel('Exception category', { exact: true })).toHaveValue(
      'road_closure',
    );
    await expect(table.locator('tbody tr')).toHaveCount(25);
    await page.getByRole('button', { name: 'Dispatch flags', exact: true }).click();
    await expect(page.getByText('Latest saved dispatcher flags.', { exact: false })).toBeVisible();
    await page.getByLabel('Recorded flag', { exact: true }).selectOption('missing');
    await expect(table.locator('tbody tr').first()).toContainText('Dispatcher marked missing');
    expect(evidence.requests.at(-1)?.searchParams.get('operational_status')).toBe('in.(missing)');
  });

test('report evidence clears on denial, retries empty results and ignores superseded responses', async ({
  page,
}) => {
  const { evidence } = await installEvidence(page);
  await page.goto('/admin/trips?tripView=exceptions');
  await expect(page.getByTestId('trip-evidence-table')).toBeVisible();
  evidence.fail = true;
  await page.getByRole('button', { name: 'Refresh trips', exact: true }).click();
  await expect(page.getByTestId('trip-search-error')).toContainText('administrator permissions');
  await expect(page.getByTestId('trip-evidence-table')).toHaveCount(0);
  evidence.fail = false;
  evidence.empty = true;
  await page.getByRole('button', { name: 'Retry trips', exact: true }).click();
  await expect(page.getByText('No recorded evidence found')).toBeVisible();
  evidence.empty = false;
  evidence.delay = 300;
  await page.getByRole('button', { name: 'Dispatch flags', exact: true }).click();
  await page.getByRole('button', { name: 'Trip history', exact: true }).click();
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  await expect(page.getByTestId('trip-evidence-table')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Actual start', exact: true })).toBeVisible();
  await page.goto('/admin/live-trips');
  await expect(page.getByRole('button', { name: 'Driver exceptions', exact: true })).toHaveCount(0);
});
