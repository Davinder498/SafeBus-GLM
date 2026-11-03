import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useDriverLocationSharing,
  type UseDriverLocationSharingResult,
} from './useDriverLocationSharing';
import type { NativeTrackingStatus } from '@/types/nativeTracking';
import { updateBusTrackingLocation } from '@/services/driverLocationService';

vi.mock('@/services/driverLocationService', () => ({
  updateBusTrackingLocation: vi.fn(),
  isFatalLocationUpdateError: vi.fn(),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
let location: UseDriverLocationSharingResult;
let status: NativeTrackingStatus;
const getStatus = vi.fn();
const resume = vi.fn();
const pause = vi.fn();
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
function Harness({ token }: { token: string | null }) {
  location = useDriverLocationSharing(token, true);
  return <span>{JSON.stringify(location.state)}</span>;
}
async function render(token: string | null = 'session-a') {
  await act(async () => root.render(<Harness token={token} />));
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T09:00:00Z'));
  vi.resetAllMocks();
  status = {
    statusVersion: 2,
    configured: true,
    collecting: true,
    queuedEvents: 0,
    connected: true,
    lastAcceptedAt: new Date().toISOString(),
  };
  getStatus.mockImplementation(async () => ({ ...status }));
  resume.mockImplementation(async () => ({ ...status, collecting: true }));
  pause.mockImplementation(async () => ({ ...status, collecting: false }));
  window.SafeBusNativeTracking = {
    getStatus,
    resume,
    pause,
    stop: vi.fn(),
    activate: vi.fn(),
    prepare: vi.fn(),
    openAppSettings: vi.fn(),
    openLocationServices: vi.fn(),
  };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.SafeBusNativeTracking;
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  else Reflect.deleteProperty(navigator, 'geolocation');
});
it('observes a paused collector without automatically resuming it', async () => {
  status.collecting = false;
  status.queuedEvents = 3;
  await render();
  await tick();
  expect(location.state).toMatchObject({ kind: 'recovering', offline: false });
  expect(resume).not.toHaveBeenCalled();
  expect(pause).not.toHaveBeenCalled();
});
it('keeps offline authoritative across subsequent native polls and recovers online', async () => {
  await render();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => window.dispatchEvent(new Event('offline')));
  await tick();
  expect(location.state.kind).toBe('offline');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(location.state).toMatchObject({ kind: 'sharing', delivery: 'active' });
});
it('expires a formerly fresh acknowledgement even without queued events', async () => {
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(130_000);
  });
  expect(location.state).toMatchObject({ kind: 'sharing', delivery: 'delayed' });
});
it('ignores late status from a replaced trip and makes only one poll at a time', async () => {
  let resolve!: (value: NativeTrackingStatus) => void;
  getStatus.mockReturnValueOnce(
    new Promise<NativeTrackingStatus>((done) => {
      resolve = done;
    }),
  );
  await render();
  await tick();
  expect(getStatus).toHaveBeenCalledTimes(1);
  status.collecting = false;
  status.queuedEvents = 2;
  await render('session-b');
  await act(async () => resolve({ ...status, collecting: true, queuedEvents: 0 }));
  expect(location.state.kind).toBe('recovering');
});
it('clears old success on status failure and retries by polling', async () => {
  await render();
  getStatus.mockRejectedValueOnce(new Error('native bridge failure'));
  await tick();
  expect(location.state.kind).toBe('error');
  await tick();
  expect(location.state.kind).toBe('sharing');
});
it('does not leave prior success visible when the native bridge stops responding', async () => {
  await render();
  getStatus.mockReturnValueOnce(new Promise(() => undefined));
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(location.state.kind).toBe('error');
  expect(getStatus).toHaveBeenCalledTimes(2);
});
it('ages an explicit resume acknowledgement even if a superseded status read remains hung', async () => {
  getStatus.mockReturnValueOnce(new Promise(() => undefined));
  await render();
  await act(async () => location.start());
  expect(location.state).toMatchObject({ kind: 'sharing', delivery: 'active' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_001);
  });
  expect(location.state).toMatchObject({ kind: 'sharing', delivery: 'delayed' });
});
it('polling cannot override an explicit pause while the native operation is pending', async () => {
  await render();
  let resolve!: (value: NativeTrackingStatus) => void;
  pause.mockReturnValueOnce(
    new Promise<NativeTrackingStatus>((done) => {
      resolve = done;
    }),
  );
  await act(async () => location.stop());
  await tick();
  expect(getStatus).toHaveBeenCalledTimes(1);
  expect(location.state.kind).toBe('waiting');
  status.collecting = false;
  status.queuedEvents = 1;
  await act(async () => resolve(status));
  expect(location.state.kind).toBe('recovering');
  await act(async () => location.start());
  expect(resume).toHaveBeenCalledOnce();
});
it('clears status when the current account or trip is removed', async () => {
  await render();
  await render(null);
  await tick();
  expect(location.state.kind).toBe('inactive');
  expect(getStatus).toHaveBeenCalledTimes(1);
  expect(resume).not.toHaveBeenCalled();
});

it('confirms collection off while retaining pending native delivery', async () => {
  status.queuedEvents = 3;
  await render();
  await act(async () => location.stopAndConfirm());
  expect(pause).toHaveBeenCalledOnce();
  expect(location.state).toMatchObject({ kind: 'recovering' });
  expect(resume).not.toHaveBeenCalled();
});

it.each([
  { statusVersion: 2, collecting: true, queuedEvents: 0, configured: true },
  { collecting: false, queuedEvents: 0, configured: true },
  { statusVersion: 2, queuedEvents: 0, configured: true },
])('rejects an unverified local stop acknowledgement: %j', async (response) => {
  await render();
  pause.mockResolvedValue(response);
  await act(async () => {
    await expect(location.stopAndConfirm()).rejects.toThrow('Could not confirm');
  });
  expect(location.state.kind).toBe('error');
  expect(resume).not.toHaveBeenCalled();
});

it('propagates native stop errors and does not restart after reconnecting', async () => {
  await render();
  pause.mockRejectedValue(new Error('Local storage unavailable'));
  await act(async () => {
    await expect(location.stopAndConfirm()).rejects.toThrow('force stop SafeBus');
  });
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(resume).not.toHaveBeenCalled();
});

it('bounds an unresponsive stop and ignores its late acknowledgement', async () => {
  await render();
  let resolve!: (value: NativeTrackingStatus) => void;
  pause.mockReturnValue(
    new Promise<NativeTrackingStatus>((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    const result = expect(location.stopAndConfirm()).rejects.toThrow('Could not confirm');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });
  expect(location.state.kind).toBe('error');
  await act(async () => resolve({ ...status, collecting: false }));
  expect(location.state.kind).toBe('error');
  expect(resume).not.toHaveBeenCalled();
});

it('keeps the browser collector off when an in-flight location request fails after stop', async () => {
  delete window.SafeBusNativeTracking;
  let onFix!: PositionCallback;
  let onError!: PositionErrorCallback;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((callback: PositionCallback, error: PositionErrorCallback) => {
        onFix = callback;
        onError = error;
        return 7;
      }),
      clearWatch,
    },
  });
  let reject!: (error: Error) => void;
  vi.mocked(updateBusTrackingLocation).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  await render('browser-session');
  await act(async () =>
    onFix({
      coords: { latitude: 53.5, longitude: -113.5, accuracy: 5, heading: null, speed: null },
    } as GeolocationPosition),
  );
  expect(updateBusTrackingLocation).toHaveBeenCalledOnce();
  await act(async () => location.stopAndConfirm());
  expect(clearWatch).toHaveBeenCalledWith(7);
  expect(location.state.kind).toBe('inactive');
  await act(async () => {
    onFix({ coords: { latitude: 53.6, longitude: -113.6 } } as GeolocationPosition);
    onError({ code: 2 } as GeolocationPositionError);
  });
  expect(location.state.kind).toBe('inactive');
  await act(async () => reject(new Error('Offline')));
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(location.state.kind).toBe('inactive');
  expect(updateBusTrackingLocation).toHaveBeenCalledOnce();
});
