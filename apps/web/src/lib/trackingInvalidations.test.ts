import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeBusSupabaseClient } from '@/lib/supabase';
import {
  subscribeToTrackingInvalidations,
  type TrackingConnectionState,
} from './trackingInvalidations';

function fixture() {
  const channels: Array<{
    topic: string;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    teardown: ReturnType<typeof vi.fn>;
    broadcast: () => void;
    status: (value: string) => void;
  }> = [];
  const fake = {
    channel: vi.fn((topic: string) => {
      let broadcast = () => {};
      let status = (_value: string) => {};
      const channel = {
        topic,
        on: vi.fn((_kind, _filter, callback: () => void) => {
          broadcast = callback;
          return channel;
        }),
        subscribe: vi.fn((callback: (value: string) => void) => {
          status = callback;
          return channel;
        }),
        teardown: vi.fn(),
        broadcast: () => broadcast(),
        status: (value: string) => status(value),
      };
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  };
  return { fake, client: fake as unknown as SafeBusSupabaseClient, channels };
}

const releases: Array<() => void> = [];
function listen(client: SafeBusSupabaseClient, topic = 'safebus:guardian:a') {
  const listener = {
    onState: vi.fn<(state: TrackingConnectionState) => void>(),
    onInvalidate: vi.fn(),
    onDisconnected: vi.fn(),
  };
  const release = subscribeToTrackingInvalidations(client, topic, listener);
  releases.push(release);
  return { ...listener, release };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared private tracking subscription', () => {
  it('joins once and coalesces a burst for every consumer without sharing any payload', async () => {
    const { fake, client, channels } = fixture();
    const a = listen(client),
      b = listen(client);
    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(fake.channel).toHaveBeenCalledWith('safebus:guardian:a', {
      config: { private: true },
    });
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1);
    expect(channels[0].on).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(149);
    expect(a.onInvalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(a.onInvalidate.mock.calls).toEqual([[]]);
    expect(b.onInvalidate.mock.calls).toEqual([[]]);
  });

  it('does not slow normal three-second signals to the polling interval', async () => {
    const { client, channels } = fixture();
    const a = listen(client),
      b = listen(client);
    for (let i = 0; i < 5; i++) {
      channels[0].broadcast();
      await vi.advanceTimersByTimeAsync(3_000);
    }
    expect(a.onInvalidate).toHaveBeenCalledTimes(5);
    expect(b.onInvalidate).toHaveBeenCalledTimes(5);
  });

  it('keeps the channel when one consumer unmounts and removes it only after the last', async () => {
    const { fake, client, channels } = fixture();
    const a = listen(client),
      b = listen(client);
    a.release();
    a.release();
    expect(fake.removeChannel).not.toHaveBeenCalled();
    channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(a.onInvalidate).not.toHaveBeenCalled();
    expect(b.onInvalidate).toHaveBeenCalledTimes(1);
    b.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(channels[0].teardown).toHaveBeenCalledTimes(1);
  });

  it('isolates topics and client instances', async () => {
    const a = fixture(),
      b = fixture();
    const guardianA = listen(a.client),
      guardianB = listen(a.client, 'safebus:guardian:b');
    const otherClient = listen(b.client);
    a.channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(guardianA.onInvalidate).toHaveBeenCalledTimes(1);
    expect(guardianB.onInvalidate).not.toHaveBeenCalled();
    expect(otherClient.onInvalidate).not.toHaveBeenCalled();
  });

  it('shares stable connection state with late consumers', async () => {
    const { client, channels } = fixture();
    const a = listen(client);
    channels[0].status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(1_000);
    const b = listen(client);
    expect(a.onState).toHaveBeenLastCalledWith('connected');
    expect(b.onState).toHaveBeenLastCalledWith('connected');
  });

  it('clears every established consumer synchronously on connection loss', async () => {
    const { client, channels } = fixture();
    const a = listen(client),
      b = listen(client);
    channels[0].status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(1_000);
    a.onInvalidate.mockClear();
    b.onInvalidate.mockClear();
    channels[0].status('CHANNEL_ERROR');
    expect(a.onDisconnected).toHaveBeenCalledTimes(1);
    expect(b.onDisconnected).toHaveBeenCalledTimes(1);
    expect(a.onState).toHaveBeenLastCalledWith('reconnecting');
    expect(a.onInvalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(a.onInvalidate).toHaveBeenCalledTimes(1);
    expect(b.onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('does not mark an offline connection connected from an old stability timer', async () => {
    const { client, channels } = fixture();
    const a = listen(client);
    channels[0].status('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(200);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(a.onState).toHaveBeenLastCalledWith('offline');
    expect(a.onDisconnected).toHaveBeenCalledTimes(1);
  });

  it('uses unavailable state on an initial failed join so secured polling can continue', async () => {
    const { client, channels } = fixture();
    const a = listen(client),
      b = listen(client);
    channels[0].status('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(a.onState).toHaveBeenLastCalledWith('unavailable');
    expect(b.onState).toHaveBeenLastCalledWith('unavailable');
    expect(a.onDisconnected).not.toHaveBeenCalled();
  });

  it('clears a lost joined connection even before its UI stability timer expires', async () => {
    const { client, channels } = fixture();
    const a = listen(client);
    channels[0].status('SUBSCRIBED');
    channels[0].status('CHANNEL_ERROR');
    expect(a.onDisconnected).toHaveBeenCalledTimes(1);
    expect(a.onState).toHaveBeenLastCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.onState).toHaveBeenLastCalledWith('reconnecting');
  });

  it('cancels pending signals and ignores obsolete callbacks after last release', async () => {
    const { client, channels } = fixture();
    const a = listen(client);
    channels[0].status('SUBSCRIBED');
    channels[0].broadcast();
    a.release();
    const states = a.onState.mock.calls.length;
    channels[0].status('SUBSCRIBED');
    channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(a.onInvalidate).not.toHaveBeenCalled();
    expect(a.onState).toHaveBeenCalledTimes(states);
  });

  it('serializes replacement behind asynchronous removal of the same topic', async () => {
    const { fake, client, channels } = fixture();
    let done!: () => void;
    fake.removeChannel.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    const a = listen(client);
    a.release();
    const b = listen(client);
    expect(fake.channel).toHaveBeenCalledTimes(1);
    channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(b.onInvalidate).not.toHaveBeenCalled();
    done();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.channel).toHaveBeenCalledTimes(2);
    channels[1].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(b.onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('keeps the original removal barrier through multiple cancelled replacements', async () => {
    const { fake, client } = fixture();
    let done!: () => void;
    fake.removeChannel.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    listen(client).release();
    listen(client).release();
    await vi.advanceTimersByTimeAsync(0);
    listen(client);
    expect(fake.channel).toHaveBeenCalledTimes(1);
    done();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.channel).toHaveBeenCalledTimes(2);
  });

  it('forces local teardown even if channel removal reports an error', async () => {
    const { fake, client, channels } = fixture();
    fake.removeChannel.mockRejectedValueOnce(new Error('synthetic removal failure'));
    listen(client).release();
    await vi.advanceTimersByTimeAsync(0);
    expect(channels[0].teardown).toHaveBeenCalledTimes(1);
    listen(client);
    expect(fake.channel).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch refresh signals while hidden or offline', async () => {
    const { client, channels } = fixture();
    const a = listen(client);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(a.onInvalidate).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    channels[0].broadcast();
    await vi.advanceTimersByTimeAsync(150);
    expect(a.onInvalidate).not.toHaveBeenCalled();
  });
});
