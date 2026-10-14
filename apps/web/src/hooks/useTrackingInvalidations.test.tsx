import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrackingInvalidations } from './useTrackingInvalidations';

const mocks = vi.hoisted(() => ({ client: { channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: mocks.client }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const channels: Array<{
  broadcast: () => void;
  status: (status: string) => void;
  teardown: ReturnType<typeof vi.fn>;
}> = [];
let root: Root;
let states: string[];
function Probe({ topic, onInvalidate }: { topic: string | null; onInvalidate: () => void }) {
  states.push(useTrackingInvalidations({ topic, onInvalidate }));
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  states = [];
  channels.length = 0;
  mocks.client.channel.mockReset().mockImplementation(() => {
    let broadcast = () => {};
    let status = (_status: string) => {};
    const channel = {
      on: vi.fn((_event, _filter, callback: () => void) => {
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
  });
  mocks.client.removeChannel.mockReset().mockResolvedValue('ok');
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tracking hook ownership and scope', () => {
  it('updates the consumer callback without resubscribing on render', async () => {
    const first = vi.fn(),
      latest = vi.fn();
    await act(async () => root.render(<Probe topic="safebus:guardian:a" onInvalidate={first} />));
    await act(async () => root.render(<Probe topic="safebus:guardian:a" onInvalidate={latest} />));
    await act(async () => {
      channels[0].broadcast();
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(mocks.client.channel).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('ignores old-principal signals and never renders its connected state for a new topic', async () => {
    const first = vi.fn(),
      next = vi.fn();
    await act(async () => root.render(<Probe topic="safebus:guardian:a" onInvalidate={first} />));
    await act(async () => {
      channels[0].status('SUBSCRIBED');
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(states.at(-1)).toBe('connected');
    first.mockClear();
    states = [];
    await act(async () => root.render(<Probe topic="safebus:guardian:b" onInvalidate={next} />));
    expect(states[0]).toBe('connecting');
    await act(async () => {
      channels[0].broadcast();
      channels[1].broadcast();
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode remount with two consumers and keeps the surviving consumer subscribed', async () => {
    const a = vi.fn(),
      b = vi.fn();
    await act(async () =>
      root.render(
        <StrictMode>
          <Probe key="a" topic="safebus:guardian:a" onInvalidate={a} />
          <Probe key="b" topic="safebus:guardian:a" onInvalidate={b} />
        </StrictMode>,
      ),
    );
    // Each StrictMode generation has one channel for both consumers, not two.
    expect(mocks.client.channel).toHaveBeenCalledTimes(2);
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);
    await act(async () =>
      root.render(
        <StrictMode>
          <Probe key="b" topic="safebus:guardian:a" onInvalidate={b} />
        </StrictMode>,
      ),
    );
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);
    await act(async () => {
      channels[1].broadcast();
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not create a channel without an authorized topic', async () => {
    await act(async () => root.render(<Probe topic={null} onInvalidate={vi.fn()} />));
    expect(mocks.client.channel).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe('unavailable');
  });
});
