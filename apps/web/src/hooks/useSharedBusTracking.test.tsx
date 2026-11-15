import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSharedBusTracking } from './useSharedBusTracking';
import { validBusTrackingTopic } from '@/lib/sharedBusTracking';

const mocks = vi.hoisted(() => ({ client: { channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: mocks.client }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const a = 'safebus:bus:' + 'a'.repeat(64),
  b = 'safebus:bus:' + 'b'.repeat(64);
let root: Root;
let ready = false;
const invalidate = vi.fn(),
  disconnected = vi.fn();
const channels: Array<{ status: (s: string) => void; broadcast: () => void }> = [];
function Probe({ user = 'a', topics = [a] }: { user?: string; topics?: string[] }) {
  ready = useSharedBusTracking(user, topics, invalidate, disconnected);
  return null;
}
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  ready = false;
  channels.length = 0;
  invalidate.mockReset();
  disconnected.mockReset();
  mocks.client.channel.mockReset().mockImplementation(() => {
    let status = (_s: string) => {},
      broadcast = () => {};
    const channel = {
      on: vi.fn((_event, _filter, callback: () => void) => {
        broadcast = callback;
        return channel;
      }),
      subscribe: vi.fn((callback: (s: string) => void) => {
        status = callback;
        return channel;
      }),
      teardown: vi.fn(),
      status: (s: string) => status(s),
      broadcast: () => broadcast(),
    };
    channels.push(channel);
    return channel;
  });
  mocks.client.removeChannel.mockReset().mockResolvedValue('ok');
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await advance(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('joins only validated, deduplicated private topics and requires every channel to connect', async () => {
  await act(async () => root.render(<Probe topics={[a, b, a, 'safebus:tenant:any', 'bad']} />));
  expect(mocks.client.channel).toHaveBeenCalledTimes(2);
  expect(mocks.client.channel).toHaveBeenCalledWith(a, { config: { private: true } });
  await act(async () => channels[0].status('SUBSCRIBED'));
  await advance(1000);
  expect(ready).toBe(false);
  await act(async () => channels[1].status('SUBSCRIBED'));
  await advance(1000);
  expect(ready).toBe(true);
  await act(async () => channels[1].status('CHANNEL_ERROR'));
  expect(ready).toBe(false);
  expect(disconnected).toHaveBeenCalledOnce();
});
it('releases hidden/offline viewers and rejoins on return without claiming old readiness', async () => {
  await act(async () => root.render(<Probe />));
  await act(async () => channels[0].status('SUBSCRIBED'));
  await advance(1000);
  expect(ready).toBe(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(ready).toBe(false);
  expect(mocks.client.removeChannel).toHaveBeenCalledOnce();
  invalidate.mockClear();
  await act(async () => channels[0].broadcast());
  await advance(1000);
  expect(invalidate).not.toHaveBeenCalled();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await advance(0);
  expect(mocks.client.channel).toHaveBeenCalledTimes(2);
  expect(ready).toBe(false);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event('offline')));
  expect(mocks.client.removeChannel).toHaveBeenCalledTimes(2);
});
it('drops the old account/topic and ignores late callbacks, including StrictMode teardown', async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ),
  );
  await advance(0);
  await act(async () => channels.at(-1)!.status('SUBSCRIBED'));
  await advance(1000);
  expect(ready).toBe(true);
  const old = [...channels];
  invalidate.mockClear();
  await act(async () =>
    root.render(
      <StrictMode>
        <Probe user="b" topics={[b]} />
      </StrictMode>,
    ),
  );
  expect(ready).toBe(false);
  await act(async () => old.forEach((channel) => channel.broadcast()));
  await advance(150);
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <StrictMode>
        <Probe user="b" topics={[]} />
      </StrictMode>,
    ),
  );
  expect(ready).toBe(false);
});
it('rejects internal identifiers, arbitrary channels and malformed server values', () => {
  for (const value of [
    null,
    undefined,
    42,
    a + 'extra',
    'safebus:guardian:a',
    'safebus:bus:' + 'A'.repeat(64),
  ])
    expect(validBusTrackingTopic(value)).toBe(false);
  expect(validBusTrackingTopic(a)).toBe(true);
});
