import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useGuardianHomeData } from './useGuardianHomeData';

const mocks = vi.hoisted(() => ({
  user: { id: 'guardian-a' } as { id: string } | null,
  buses: vi.fn(),
  stops: vi.fn(),
  invalidate: () => {},
  disconnect: () => {},
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/services/guardianLiveBusLocationService', () => ({
  fetchGuardianBusVisibility: mocks.buses,
}));
vi.mock('@/services/guardianStudentStopsService', () => ({
  fetchGuardianStudentStops: mocks.stops,
}));
vi.mock('@/hooks/useTrackingInvalidations', () => ({
  useTrackingInvalidations: (options: { onInvalidate: () => void; onDisconnected: () => void }) => {
    mocks.invalidate = options.onInvalidate;
    mocks.disconnect = options.onDisconnected;
    return 'connected';
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let result: ReturnType<typeof useGuardianHomeData>;
function Probe() {
  result = useGuardianHomeData();
  return null;
}
const render = () => act(async () => root.render(<Probe />));
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  mocks.user = { id: 'guardian-a' };
  mocks.buses.mockReset().mockResolvedValue([{ hasActiveTrip: true, busNumber: '42' }]);
  mocks.stops.mockReset().mockResolvedValue([{ busNumber: '42', pickupStopName: 'Old stop' }]);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('refreshes ended trips and changed assignments without navigation, including when no hints arrive', async () => {
  await render();
  mocks.buses.mockResolvedValue([{ hasActiveTrip: false, busNumber: '43' }]);
  mocks.stops.mockResolvedValue([{ busNumber: '43', pickupStopName: 'New stop' }]);
  await advance(32_499);
  expect(mocks.buses).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(result.state).toEqual({
    kind: 'ready',
    data: {
      buses: [{ hasActiveTrip: false, busNumber: '43' }],
      stops: [{ busNumber: '43', pickupStopName: 'New stop' }],
    },
  });
});

it('bounds continuous GPS and burst hints to one refresh per jittered window without starving the trailing check', async () => {
  await render();
  for (let i = 0; i < 10; i++) {
    await advance(3_000);
    await act(async () => {
      mocks.invalidate();
      mocks.invalidate();
    });
  }
  expect(mocks.buses).toHaveBeenCalledTimes(1);
  await advance(2_500);
  expect(mocks.buses).toHaveBeenCalledTimes(2);
  expect(mocks.stops).toHaveBeenCalledTimes(2);
});

it('aborts both requests and removes old data offline or hidden, then rechecks immediately on return', async () => {
  await render();
  let resolve!: (rows: unknown[]) => void;
  mocks.buses.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => result.refresh());
  const signal = mocks.buses.mock.calls.at(-1)?.[0] as AbortSignal;
  expect(mocks.stops.mock.calls.at(-1)?.[0]).toBe(signal);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(signal.aborted).toBe(true);
  expect(result.state.kind).toBe('error');
  await act(async () => resolve([{ busNumber: 'old' }]));
  await advance(100_000);
  expect(mocks.buses).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.buses).toHaveBeenCalledTimes(3);
  expect(result.state.kind).toBe('ready');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event('offline')));
  expect(result.state.kind).toBe('error');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(result.state.kind).toBe('ready');
});

it('fails closed on denied bus access and backs off fallback retries, while manual retry stays immediate', async () => {
  await render();
  mocks.buses.mockRejectedValue(new Error('denied'));
  await act(async () => result.refresh());
  expect(result.state.kind).toBe('error');
  await advance(62_499);
  expect(mocks.buses).toHaveBeenCalledTimes(2);
  await advance(1);
  expect(mocks.buses).toHaveBeenCalledTimes(3);
  await advance(122_499);
  expect(mocks.buses).toHaveBeenCalledTimes(3);
  await advance(1);
  expect(mocks.buses).toHaveBeenCalledTimes(4);
  mocks.buses.mockResolvedValue([]);
  await act(async () => result.refresh());
  expect(result.state).toEqual({
    kind: 'ready',
    data: { buses: [], stops: [{ busNumber: '42', pickupStopName: 'Old stop' }] },
  });
});

it('never restores another principal or scope from a late response and cancels on signout', async () => {
  let resolve!: (rows: unknown[]) => void;
  mocks.buses.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  const signal = mocks.buses.mock.calls[0][0] as AbortSignal;
  mocks.user = { id: 'guardian-b' };
  mocks.buses.mockResolvedValue([]);
  mocks.stops.mockResolvedValue([]);
  await render();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve([{ busNumber: 'private-old' }]));
  expect(result.state).toEqual({ kind: 'ready', data: { buses: [], stops: [] } });
  mocks.user = null;
  await render();
  await advance(100_000);
  expect(result.state.kind).toBe('loading');
  expect(mocks.buses).toHaveBeenCalledTimes(2);
});

it('displays bus status with unavailable stops instead of retaining old stop assignments', async () => {
  await render();
  mocks.stops.mockRejectedValue(new Error('denied'));
  await act(async () => result.refresh());
  expect(result.state.kind === 'ready' && result.state.data.stops).toBe(null);
});
