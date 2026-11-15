import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVerifiedGuardianData } from './useVerifiedGuardianData';
import type { TrackingInvalidationKind } from '@/lib/trackingInvalidations';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  invalidate: (_kind?: TrackingInvalidationKind) => {},
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ user: { id: 'guardian-a' } }) }));
vi.mock('@/hooks/useTrackingInvalidations', () => ({
  useTrackingInvalidations: (options: { onInvalidate: typeof mocks.invalidate }) => {
    mocks.invalidate = options.onInvalidate;
    return 'connected';
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let result: ReturnType<typeof useVerifiedGuardianData>;
function Probe() {
  result = useVerifiedGuardianData(mocks.fetch, 'stops', {
    liveMinIntervalMs: 15_000,
    throttleLocationOnly: true,
  });
  return null;
}
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  mocks.fetch.mockReset().mockResolvedValue(['stop']);
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('limits repeated position hints but does not delay control or manual checks', async () => {
  for (let i = 0; i < 4; i++) {
    await advance(3_000);
    await act(async () => mocks.invalidate('location'));
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await advance(3_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  await act(async () => mocks.invalidate('change'));
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  await act(async () => result.refresh());
  expect(mocks.fetch).toHaveBeenCalledTimes(4);
  // Unknown hints must also bypass the location-only throttle.
  await act(async () => mocks.invalidate());
  expect(mocks.fetch).toHaveBeenCalledTimes(5);
});

it('retains an urgent authorization recheck across an in-flight response and later position hints', async () => {
  let resolve!: (value: string[]) => void;
  mocks.fetch.mockReturnValueOnce(
    new Promise<string[]>((done) => {
      resolve = done;
    }),
  );
  await act(async () => result.refresh());
  await act(async () => {
    mocks.invalidate('change');
    mocks.invalidate('location');
  });
  mocks.fetch.mockRejectedValueOnce(new Error('access revoked'));
  await act(async () => resolve(['old stop']));
  await advance(0);
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(result.state.kind).toBe('error');
});

it('cancels a pending stop refresh while hidden and verifies immediately on return', async () => {
  await act(async () => mocks.invalidate('location'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await advance(60_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(result.state.kind).toBe('error');
  mocks.fetch.mockResolvedValue([]);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.state).toEqual({ kind: 'ready', data: [] });
});
