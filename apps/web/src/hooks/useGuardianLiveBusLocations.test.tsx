import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGuardianLiveBusLocations,
  type UseGuardianLiveBusLocationsResult,
} from './useGuardianLiveBusLocations';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

const mocks = vi.hoisted(() => ({
  user: { id: 'guardian-a' } as { id: string } | null,
  fetch: vi.fn(),
  disconnect: () => {},
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/services/guardianLiveBusLocationService', () => ({
  fetchGuardianLiveBusLocations: mocks.fetch,
}));
vi.mock('@/hooks/useTrackingInvalidations', () => ({
  useTrackingInvalidations: (options: { onDisconnected: () => void }) => {
    mocks.disconnect = options.onDisconnected;
    return 'connected';
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function deferred() {
  let resolve!: (value: GuardianStudentLiveBusLocation[]) => void;
  const promise = new Promise<GuardianStudentLiveBusLocation[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const location: GuardianStudentLiveBusLocation = {
  studentId: 'student-a',
  studentName: 'Synthetic Student',
  studentGrade: '4',
  assignmentState: 'assigned',
  busNumber: '42',
  licensePlate: 'TEST',
  hasActiveTrip: true,
  locationState: 'fresh',
  latitude: 51,
  longitude: -114,
  locationRecordedAt: '2026-09-18T15:00:00Z',
  locationAgeSeconds: 10,
  etaStatus: null,
  etaLabel: null,
  studentTripStatus: 'not_picked_up',
  pickupEventTime: null,
  dropoffEventTime: null,
  lastEventTime: null,
};

let root: Root;
let result: UseGuardianLiveBusLocationsResult;
function Probe() {
  result = useGuardianLiveBusLocations();
  return null;
}
async function render(strict = false) {
  await act(async () =>
    root.render(
      strict ? (
        <StrictMode>
          <Probe />
        </StrictMode>
      ) : (
        <Probe />
      ),
    ),
  );
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.user = { id: 'guardian-a' };
  mocks.fetch.mockReset().mockResolvedValue([location]);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('guardian location verification lifecycle', () => {
  it('clears previously fresh data when a refresh hangs, and permits recovery', async () => {
    await render();
    expect(result.state.kind).toBe('ready');
    const slow = deferred();
    mocks.fetch.mockReturnValueOnce(slow.promise);
    await act(async () => {
      result.refresh();
    });
    await advance(10_000);
    expect(result.state.kind).toBe('error');
    expect(result.refreshing).toBe(false);
    await act(async () => {
      result.refresh();
    });
    expect(result.state.kind).toBe('ready');
    await act(async () => slow.resolve([]));
    expect(result.state).toEqual({ kind: 'ready', locations: [location] });
  });

  it('discards an old guardian response after switching accounts', async () => {
    const old = deferred();
    mocks.fetch.mockReturnValueOnce(old.promise);
    await render();
    mocks.user = { id: 'guardian-b' };
    mocks.fetch.mockResolvedValue([]);
    await render();
    expect(result.state).toEqual({ kind: 'ready', locations: [] });
    await act(async () => old.resolve([location]));
    expect(result.state).toEqual({ kind: 'ready', locations: [] });
  });

  it('clears hidden-page data and revalidates on return', async () => {
    await render();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.state.kind).toBe('error');
    const calls = mocks.fetch.mock.calls.length;
    await advance(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    mocks.fetch.mockResolvedValue([]);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.state).toEqual({ kind: 'ready', locations: [] });
  });

  it('does not restore disconnected data from an in-flight response', async () => {
    await render();
    const slow = deferred();
    mocks.fetch.mockReturnValueOnce(slow.promise);
    await act(async () => {
      result.refresh();
    });
    await act(async () => mocks.disconnect());
    await act(async () => slow.resolve([location]));
    expect(result.state.kind).toBe('error');
    await act(async () => {
      result.refresh();
    });
    expect(result.state.kind).toBe('ready');
  });

  it('does not fetch while signed out', async () => {
    mocks.user = null;
    await render();
    await advance(30_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('survives StrictMode cleanup and polls without duplicate timers', async () => {
    mocks.fetch.mockResolvedValue([]);
    await render(true);
    expect(result.state).toEqual({ kind: 'ready', locations: [] });
    const calls = mocks.fetch.mock.calls.length;
    await advance(15_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls + 1);
  });

  it('coalesces refresh bursts and cancels the active transport on unmount', async () => {
    const slow = deferred();
    mocks.fetch.mockReturnValueOnce(slow.promise);
    await render();
    await act(async () => {
      result.refresh();
      result.refresh();
      result.refresh();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve([]));
    await advance(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const pending = deferred();
    mocks.fetch.mockReturnValueOnce(pending.promise);
    await act(async () => {
      result.refresh();
    });
    const signal = mocks.fetch.mock.calls.at(-1)?.[0] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    const calls = mocks.fetch.mock.calls.length;
    await act(async () => pending.resolve([location]));
    await advance(30_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
  });

  it('clears data while offline and revalidates when the connection returns', async () => {
    await render();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event('offline')));
    expect(result.state.kind).toBe('error');
    const calls = mocks.fetch.mock.calls.length;
    await advance(30_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    mocks.fetch.mockResolvedValue([]);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(result.state).toEqual({ kind: 'ready', locations: [] });
  });
});
