import { expect, test, type Page, type Route } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import { expectNoWcagAaViolations } from './fixtures/accessibility';

interface SearchArgs {
  p_from_date: string | null;
  p_to_date: string | null;
  p_status: string | null;
  p_page: number;
  p_page_size: number;
}

function trip(id: string, date: string, status = 'completed') {
  return {
    trip_id: id,
    service_date: date,
    status,
    started_at: `${date}T14:30:00Z`,
    ended_at: status === 'active' || status === 'paused' ? null : `${date}T15:30:00Z`,
    route_name: `Route ${id}`,
    route_code: 'PR1',
    trip_pattern_name: 'School bound',
    direction: status === 'cancelled' ? 'reverse' : 'forward',
    bus_label: '12',
    driver_label: 'Alex Driver',
  };
}

const trips = [
  ...['active', 'paused', 'completed', 'cancelled'].map((status) =>
    trip(status, '2026-10-08', status),
  ),
  ...Array.from({ length: 225 }, (_, index) =>
    trip(`recent-${String(index).padStart(3, '0')}`, '2026-10-07'),
  ),
  trip('historical-1', '2025-01-14'),
  trip('historical-2', '2025-01-15', 'cancelled'),
];

function searchResult(args: SearchArgs) {
  const matches = trips
    .filter(
      (row) =>
        (!args.p_from_date || row.service_date >= args.p_from_date) &&
        (!args.p_to_date || row.service_date <= args.p_to_date) &&
        (!args.p_status || row.status === args.p_status),
    )
    .sort(
      (a, b) =>
        b.service_date.localeCompare(a.service_date) ||
        b.started_at.localeCompare(a.started_at) ||
        a.trip_id.localeCompare(b.trip_id),
    );
  const offset = (args.p_page - 1) * args.p_page_size;
  return { rows: matches.slice(offset, offset + args.p_page_size), totalCount: matches.length };
}

async function installOverviewMock(
  page: Page,
  options: { tripError?: boolean; summaryError?: boolean } = {},
) {
  await page.clock.setFixedTime(new Date('2026-10-09T05:30:00Z'));
  await installAdminWorkflowMock(page);
  const requests: SearchArgs[] = [];
  const controls = {
    tripError: !!options.tripError,
    summaryError: !!options.summaryError,
    requests,
  };
  await page.route('**/rest/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rpc/search_admin_trips')) {
      const args = route.request().postDataJSON() as SearchArgs;
      requests.push(args);
      return route.fulfill({
        status: controls.tripError ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          controls.tripError ? { message: 'Mock unavailable' } : searchResult(args),
        ),
      });
    }
    if (
      route.request().method() === 'HEAD' &&
      url.pathname.endsWith('/buses') &&
      controls.summaryError
    ) {
      return route.fulfill({ status: 500, body: '' });
    }
    if (url.pathname.endsWith('/pre_trip_confirmations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    if (url.pathname.endsWith('/trip_exceptions') || url.pathname.endsWith('/operational_notes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fallback();
  });
  return controls;
}

test('overview defaults to Alberta today and retains seven summary destinations', async ({
  page,
}, testInfo) => {
  const controls = await installOverviewMock(page);
  const removedRequests: string[] = [];
  page.on('request', (request) => {
    if (/get_admin_(?:live_fleet_monitoring|dashboard_overview|trip_overview)/.test(request.url()))
      removedRequests.push(request.url());
  });
  await page.goto('/admin');
  const search = page.getByTestId('admin-trip-search');
  await expect(search.locator('tbody tr')).toHaveCount(4);
  expect(controls.requests[0]).toEqual({
    p_from_date: '2026-10-08',
    p_to_date: '2026-10-08',
    p_status: null,
    p_page: 1,
    p_page_size: 25,
  });
  await expect(page.getByRole('link', { name: 'Open Live Operations' })).toHaveAttribute(
    'href',
    '/admin/live-trips',
  );
  for (const heading of ['Operational attention', 'Setup checklist', 'Routes']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel('Trip status summary')).toHaveCount(0);
  const summary = page.getByTestId('transportation-summary');
  await expect(summary.getByRole('link')).toHaveCount(7);
  for (const [label, destination] of [
    ['Buses', '/admin/buses'],
    ['Drivers', '/admin/drivers'],
    ['Routes', '/admin/routes'],
    ['Students', '/admin/students'],
    ['Guardians', '/admin/guardians'],
    ['Guardian links', '/admin/guardians'],
    ['Student bus assignments', '/admin/students'],
  ])
    await expect(
      summary.getByRole('link', { name: `${label} 1 active`, exact: true }),
    ).toHaveAttribute('href', destination);
  expect(removedRequests).toEqual([]);
  const expectedTime = await page.evaluate(() =>
    new Date('2026-10-08T14:30:00Z').toLocaleTimeString(undefined, {
      timeZone: 'America/Edmonton',
      hour: 'numeric',
      minute: '2-digit',
    }),
  );
  await expect(search).toContainText(expectedTime);
  await page.screenshot({ path: testInfo.outputPath('tenant-overview.png'), fullPage: true });
});

test('historical search reaches beyond 200 recent trips, includes range endpoints and opens notes', async ({
  page,
}) => {
  const controls = await installOverviewMock(page);
  await page.goto('/admin');
  await page.getByLabel('Dates', { exact: true }).selectOption('date');
  await page.getByLabel('Service date', { exact: true }).fill('2025-01-14');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('admin-trips-table')).toContainText('Route historical-1');
  await page.getByRole('button', { name: /View notes for Route historical-1/ }).click();
  await expect(page.getByTestId('trip-evidence-historical-1')).toBeVisible();
  await expect(page.getByTestId('operational-notes-trip-historical-1')).toBeVisible();
  await page.getByLabel('Dates', { exact: true }).selectOption('range');
  await page.getByLabel('From date').fill('2025-01-14');
  await page.getByLabel('To date').fill('2025-01-15');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('trip-evidence-historical-1')).toHaveCount(0);
  await expect(page.getByTestId('admin-trips-table')).toContainText('Return');
  const requestCount = controls.requests.length;
  await page.getByLabel('To date').fill('2025-01-13');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('end date must be on or after');
  expect(controls.requests).toHaveLength(requestCount);
  await expect(page.getByTestId('admin-trips-table').locator('tbody tr')).toHaveCount(2);
});

test('all dates paginate on the server and date/status/page-size changes reset the page', async ({
  page,
}) => {
  const controls = await installOverviewMock(page);
  await page.goto('/admin');
  await page.getByLabel('Dates', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-25 of 231');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 26-50 of 231');
  expect(controls.requests.at(-1)).toMatchObject({ p_page: 2, p_from_date: null, p_to_date: null });
  await page.getByLabel('Rows', { exact: true }).selectOption('100');
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 1-100 of 231');
  expect(controls.requests.at(-1)).toMatchObject({ p_page: 1, p_page_size: 100 });
  for (const status of ['Active', 'Paused', 'Completed', 'Cancelled']) {
    await page.getByRole('button', { name: status, exact: true }).click();
    await expect(page.getByRole('button', { name: status, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('admin-trips-table').locator('tbody tr').first()).toContainText(
      status,
    );
    expect(controls.requests.at(-1)).toMatchObject({ p_status: status.toLowerCase(), p_page: 1 });
  }
  await page.getByLabel('Dates', { exact: true }).selectOption('date');
  await page.getByLabel('Service date', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('admin-trips-empty')).toContainText('No trips found');
  await expect(page.getByTestId('admin-pagination')).toContainText('Showing 0-0 of 0');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
});

test('section errors stay independent and retry does not display false zeros', async ({ page }) => {
  const controls = await installOverviewMock(page, { summaryError: true });
  await page.goto('/admin');
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  await expect(page.getByTestId('transportation-summary-error')).toBeVisible();
  await expect(page.getByTestId('transportation-summary').getByRole('link')).toHaveCount(0);
  controls.summaryError = false;
  await page.getByRole('button', { name: 'Retry summary' }).click();
  await expect(page.getByTestId('transportation-summary').getByRole('link')).toHaveCount(7);
  controls.tripError = true;
  await page.getByRole('button', { name: 'Refresh trips' }).click();
  await expect(page.getByTestId('trip-search-error')).toBeVisible();
  await expect(page.getByTestId('transportation-summary').getByRole('link')).toHaveCount(7);
  controls.tripError = false;
  await page.getByRole('button', { name: 'Retry trips' }).click();
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
});

for (const lateError of [false, true]) {
  test(`outdated ${lateError ? 'error' : 'result'} cannot replace a newer status search`, async ({
    page,
  }) => {
    await installOverviewMock(page);
    let release!: () => void;
    let signalStarted!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    await page.route('**/rpc/search_admin_trips', async (route) => {
      const args = route.request().postDataJSON() as SearchArgs;
      if (args.p_status !== 'completed') return route.fallback();
      signalStarted();
      await pending;
      await route.fulfill({
        status: lateError ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(lateError ? { message: 'Late error' } : searchResult(args)),
      });
    });
    await page.goto('/admin');
    await expect(page.getByTestId('admin-trips-table')).toBeVisible();
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await started;
    await page.getByRole('button', { name: 'Paused', exact: true }).click();
    await expect(page.getByTestId('admin-trips-table')).toContainText('Route paused');
    const lateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/search_admin_trips') &&
        response.request().postDataJSON().p_status === 'completed',
    );
    release();
    await lateResponse;
    await expect(page.getByTestId('admin-trips-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('admin-trips-table')).toContainText('Route paused');
    await expect(page.getByTestId('trip-search-error')).toHaveCount(0);
  });
}

test('search controls and results are accessible on desktop and mobile', async ({ page }) => {
  await installOverviewMock(page);
  await page.goto('/admin');
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  await page.getByLabel('Dates', { exact: true }).selectOption('range');
  await page.getByRole('button', { name: 'Apply', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('admin-trips-table')).toBeVisible();
  await expectNoWcagAaViolations(page, 'Tenant overview date search');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
