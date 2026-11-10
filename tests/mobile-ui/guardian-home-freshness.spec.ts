import { expect, test } from '@playwright/test';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';

// Owned synthetic HTTP/WebSocket boundary; never connects to a hosted account.
async function openHome(page: import('@playwright/test').Page) {
  await installLocalOnlyBoundary(page);
  await page.routeWebSocket('wss://placeholder.supabase.co/realtime/v1/websocket*', (socket) =>
    socket.close(),
  );
  const fixture = await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await page.clock.install();
  await page.goto('/guardian');
  await expect(page.getByTestId('guardian-home-bus-card')).toBeVisible();
  await expect(page.getByTestId('guardian-home-last-checked')).toContainText('Last checked');
  return fixture;
}

test('home reconciles a trip ending and reassignment with no realtime delivery', async ({
  page,
}) => {
  const fixture = await openHome(page);
  await expect(page.getByTestId('guardian-home-bus-card')).toContainText('Active');
  const calls = fixture.getCallCount();
  fixture.setRows([
    guardianVisibilityRow({
      bus_number: '43',
      has_active_trip: false,
      location_state: 'inactive',
      latitude: null,
      longitude: null,
    }),
  ]);
  await page.clock.runFor(29_000);
  expect(fixture.getCallCount()).toBe(calls);
  await page.clock.runFor(6_100);
  await expect(page.getByTestId('guardian-home-bus-card')).toContainText('Bus 43');
  await expect(page.getByTestId('guardian-home-bus-card')).toContainText('Inactive');
  expect(fixture.getCallCount()).toBe(calls + 1);
  await expect(page.getByTestId('guardian-home-student-card')).toContainText('Bus 43');
  await expect(page.getByTestId('guardian-home-student-card')).not.toContainText('Cedar Avenue');
});

test('failed home recheck removes old status and manual refresh recovers denied links', async ({
  page,
}) => {
  const fixture = await openHome(page);
  fixture.setFail(true);
  await page.clock.runFor(35_100);
  await expect(page.getByText('We could not load your buses.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('guardian-home-bus-card')).toHaveCount(0);
  fixture.setFail(false);
  fixture.setRows([]);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('No linked students are available yet.', { exact: true }),
  ).toBeVisible();
});
