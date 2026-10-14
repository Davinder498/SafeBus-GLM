import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import {
  guardianBusServiceLine,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installMapProviderAvailable } from '../smoke/fixtures/map-provider';

const guardianTopic = 'realtime:safebus:guardian:11111111-1111-1111-1111-111111111111';

/** Owned synthetic Phoenix endpoint: no connection is forwarded to Supabase. */
async function installTrackingSocket(page: Page) {
  const joined = new Map<WebSocketRoute, Map<string, string | null>>();
  let joins = 0;
  await page.routeWebSocket('wss://placeholder.supabase.co/realtime/v1/websocket*', (socket) => {
    const topics = new Map<string, string | null>();
    joined.set(socket, topics);
    socket.onClose(() => joined.delete(socket));
    socket.onMessage((raw) => {
      const message: unknown = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
      if (!Array.isArray(message) || message.length !== 5)
        throw new Error('Unexpected synthetic realtime frame');
      const [joinRef, ref, topic, event] = message;
      if (event === 'phx_join') {
        if (topic === guardianTopic) joins++;
        topics.set(String(topic), typeof joinRef === 'string' ? joinRef : null);
        socket.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            'phx_reply',
            { status: 'ok', response: { postgres_changes: [] } },
          ]),
        );
      } else if (event === 'phx_leave') {
        topics.delete(String(topic));
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
      } else if (event === 'heartbeat') {
        socket.send(
          JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
      }
    });
  });
  return {
    joins: () => joins,
    active: () => [...joined.values()].filter((topics) => topics.has(guardianTopic)).length,
    emit(reason = 'location') {
      for (const [socket, topics] of joined) {
        if (topics.has(guardianTopic))
          socket.send(
            JSON.stringify([
              topics.get(guardianTopic),
              null,
              guardianTopic,
              'broadcast',
              // Coordinates in an event are deliberately irrelevant: the RPC is authoritative.
              {
                type: 'broadcast',
                event: 'tracking_changed',
                payload: { reason, latitude: 0, longitude: 0 },
              },
            ]),
          );
      }
    },
  };
}

async function openMap(page: Page) {
  await installLocalOnlyBoundary(page);
  // Keep the synthetic bus between the stop icons so the popup is pointer-accessible.
  const fixture = await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow({ latitude: 51.05 })],
  });
  await installMapProviderAvailable(page);
  const socket = await installTrackingSocket(page);
  await page.clock.install();
  await page.goto('/guardian/live-map?bus=42');
  await expect(page.getByTestId('guardian-live-bus-map-marker')).toHaveCount(1);
  // Development StrictMode remounts once; there must still be only one live owner.
  await expect.poll(socket.active).toBe(1);
  await page.clock.runFor(1_200);
  await expect(page.getByTestId('guardian-live-map-refresh-button')).toBeEnabled();
  return { fixture, socket };
}

test('one guardian live subscription refreshes both map datasets every three seconds without extra polling', async ({
  page,
}) => {
  const { fixture, socket } = await openMap(page);
  const visibilityBefore = fixture.getCallCount();
  const linesBefore = fixture.getServiceLineCallCount();
  const joinsBefore = socket.joins();
  for (let step = 1; step <= 5; step++) {
    await page.clock.runFor(2_850);
    const recordedAt = `2026-01-01T15:00:${String(step * 3).padStart(2, '0')}.000Z`;
    fixture.setRows([
      guardianVisibilityRow({
        latitude: 51.05,
        location_recorded_at: recordedAt,
      }),
    ]);
    socket.emit();
    await expect
      .poll(async () => {
        await page.clock.runFor(50);
        return fixture.getCallCount();
      })
      .toBe(visibilityBefore + step);
    await expect.poll(() => fixture.getServiceLineCallCount()).toBe(linesBefore + step);
    await expect(page.getByTestId('guardian-live-bus-map-marker')).toHaveCount(1);
    await page.getByRole('button', { name: 'Bus 42', exact: true }).click();
    const displayedTime = await page.evaluate((iso) => new Date(iso).toLocaleString(), recordedAt);
    await expect(page.locator('.leaflet-popup-content')).toContainText(`Updated ${displayedTime}`);
    await page.locator('.leaflet-popup-close-button').click();
  }
  expect(socket.joins()).toBe(joinsBefore);
  expect(socket.active()).toBe(1);
  await page.clock.runFor(14_000);
  expect(fixture.getCallCount()).toBe(visibilityBefore + 5);
  await page.clock.runFor(1_200);
  await expect.poll(() => fixture.getCallCount()).toBe(visibilityBefore + 6);
});

test('a live permission recheck clears the map when the authoritative RPC denies access', async ({
  page,
}) => {
  const { fixture, socket } = await openMap(page);
  const calls = fixture.getCallCount();
  fixture.setFail(true);
  socket.emit('authorization');
  await page.clock.runFor(300);
  await expect.poll(() => fixture.getCallCount()).toBe(calls + 1);
  await expect(page.getByTestId('guardian-live-map-error')).toBeVisible();
  await expect(page.getByTestId('guardian-live-bus-map-marker')).toHaveCount(0);
  fixture.setFail(false);
  fixture.setRows([]);
  socket.emit('authorization');
  await page.clock.runFor(300);
  await expect(page.getByTestId('guardian-live-map-empty')).toBeVisible();
  expect(socket.active()).toBe(1);
});

test('a trip-end signal promptly removes the live bus position', async ({ page }) => {
  const { fixture, socket } = await openMap(page);
  fixture.setRows([
    guardianVisibilityRow({
      has_active_trip: false,
      location_state: 'inactive',
      latitude: null,
      longitude: null,
    }),
  ]);
  fixture.setServiceLines([
    guardianBusServiceLine({
      tripStatus: 'inactive',
      locationState: 'inactive',
      latitude: null,
      longitude: null,
    }),
  ]);
  socket.emit('trip');
  await page.clock.runFor(300);
  await expect(page.getByTestId('guardian-live-bus-map-marker')).toHaveCount(0);
  await expect(
    page.getByText('No current bus location to show right now.', { exact: true }),
  ).toBeVisible();
});
