import { test, expect } from '@playwright/test';
import { installSupabaseMock, MOCK } from '../smoke/fixtures/supabase-mock';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';

test.use({ timezoneId: 'Asia/Tokyo' });
test.setTimeout(60_000);
test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

for (const [at, day, tomorrow] of [
  ['2026-01-16T01:00:00Z', '2026-01-15', '2026-01-16'],
  ['2026-07-16T01:00:00Z', '2026-07-15', '2026-07-16'],
  ['2026-11-03T01:00:00Z', '2026-11-02', '2026-11-03'],
  ['2026-11-02T06:30:00Z', '2026-11-02', '2026-11-03'],
  ['2026-11-03T06:00:00Z', '2026-11-03', '2026-11-04'],
]) {
  test(`driver planning uses Alberta service dates at ${at} on a phone set to Tokyo`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(at) });
    await installSupabaseMock(page, { withActiveTrip: true });
    const requests: string[] = [];
    await page.route('**/rest/v1/driver_route_assignments?*', async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.searchParams.get('or') ?? '');
      const requestedDay =
        (url.searchParams.get('or') ?? '').match(/effective_to.gte.([0-9-]+)/)?.[1] ?? '9999-12-31';
      const rows = [
        {
          id: 'current-plan',
          effective_from: '2025-01-01',
          effective_to: day,
          bus: { bus_number: 'CURRENT' },
        },
        {
          id: 'future-plan',
          effective_from: tomorrow,
          effective_to: null,
          bus: { bus_number: 'FUTURE' },
        },
        ...(at === '2026-11-03T06:00:00Z'
          ? [
              {
                id: 'expired-plan',
                effective_from: '2025-01-01',
                effective_to: '2026-11-02',
                bus: { bus_number: 'EXPIRED' },
              },
            ]
          : []),
      ]
        .filter((plan) => plan.effective_to === null || plan.effective_to >= requestedDay)
        .map((plan) => ({
          ...plan,
          tenant_id: MOCK.tenantId,
          driver_id: MOCK.driverId,
          bus_id: plan.id === 'current-plan' ? MOCK.busId : 'replacement-bus',
          route_id: MOCK.routeId,
          route_trip_pattern_id: MOCK.tripPatternId,
          bus_route_assignment_id: MOCK.assignmentId,
          trip_type: 'morning',
          status: 'active',
          route: { route_name: 'North Ridge Morning', route_code: 'NR-AM' },
          trip_pattern: { display_name: 'North Ridge Outbound', direction: 'forward' },
        }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    });
    await page.goto('/driver');
    const card = page.getByTestId('driver-planned-assignments');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('Bus CURRENT');
    await expect(card).toContainText('Current plan');
    await expect(card).toContainText('Bus FUTURE');
    await expect(card).toContainText('Upcoming plan');
    await expect(card).not.toContainText('Bus EXPIRED');
    await expect(page.getByTestId('driver-plan-mismatch-notice')).toHaveCount(0);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((value) => value.includes(`effective_to.gte.${day}`))).toBe(true);
  });
}
