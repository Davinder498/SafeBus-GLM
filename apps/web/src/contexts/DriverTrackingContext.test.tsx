import { savePendingTripAction, loadPendingTripAction } from '@/services/pendingDriverTripAction';
import type { DriverTrip } from '@/types/trips';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DriverTrackingProvider, useDriverTracking } from './DriverTrackingContext';
import { DriverLocationStatus } from '@/components/driver/DriverLocationStatus';
import type { NativeTrackingStatus } from '@/types/nativeTracking';
import type { ProfileRole } from './AuthContext';
const auth = vi.hoisted(() => ({
  loading: false,
  profile: { id: 'driver-a', role: 'driver' as ProfileRole, status: 'active' } as {
    id: string;
    role: ProfileRole;
    status: string;
    tenant_id?: string;
  } | null,
}));
const actions = vi.hoisted(() => ({
  fetch: vi.fn(),
  pause: vi.fn(),
  end: vi.fn(),
  cancel: vi.fn(),
  apply: vi.fn(),
}));
vi.mock('@/services/queuedTripStopService', () => ({ applyQueuedTripStop: actions.apply }));
vi.mock('@/services/driverTripService', () => ({
  fetchActiveDriverTrip: actions.fetch,
  pauseDriverTrip: actions.pause,
  endDriverTrip: actions.end,
  cancelDriverTrip: actions.cancel,
}));
vi.mock('./useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/services/driverLocationService', () => ({
  updateBusTrackingLocation: vi.fn(),
  isFatalLocationUpdateError: vi.fn(),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
let tracking: ReturnType<typeof useDriverTracking>;
let status: NativeTrackingStatus;
const getStatus = vi.fn();
const resume = vi.fn();
const stop = vi.fn();
function Harness() {
  tracking = useDriverTracking();
  return (
    <DriverLocationStatus state={tracking.location.state} supported={tracking.location.supported} />
  );
}
async function render() {
  await act(async () =>
    root.render(
      <DriverTrackingProvider>
        <Harness />
      </DriverTrackingProvider>,
    ),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  auth.loading = false;
  auth.profile = { id: 'driver-a', role: 'driver', status: 'active' };
  status = {
    statusVersion: 2,
    configured: true,
    collecting: false,
    queuedEvents: 1,
    connected: true,
  };
  getStatus.mockImplementation(async () => ({ ...status }));
  stop.mockResolvedValue(status);
  window.SafeBusNativeTracking = {
    getStatus,
    resume,
    stop,
    pause: vi.fn().mockImplementation(async () => ({ ...status, collecting: false })),
    activate: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn(),
    openAppSettings: vi.fn(),
    openLocationServices: vi.fn(),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.SafeBusNativeTracking;
});
it.each([
  'guardian',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'platform_super_admin',
] as const)('does not restore native driver metadata for %s', async (role) => {
  auth.profile = { id: 'other-account', role, status: 'active' };
  await render();
  expect(getStatus).not.toHaveBeenCalled();
  expect(resume).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
  expect(tracking.location.state.kind).toBe('inactive');
});
it('restores paused delivery for a driver without resuming collection or requiring optional MFA', async () => {
  await render();
  expect(container.textContent).toContain('Queued updates remain on this phone');
  expect(resume).not.toHaveBeenCalled();
});
it('keeps pending recovery visible after ending the trip', async () => {
  await render();
  await act(async () => tracking.clearTracking());
  expect(stop).toHaveBeenCalledOnce();
  expect(tracking.location.state.kind).toBe('recovering');
  expect(container.textContent).not.toContain('active.');
  expect(resume).not.toHaveBeenCalled();
});
it('ignores the former account response while a new driver is loading status', async () => {
  await render();
  let resolve!: (value: NativeTrackingStatus) => void;
  getStatus.mockReturnValueOnce(
    new Promise<NativeTrackingStatus>((done) => {
      resolve = done;
    }),
  );
  auth.profile = { id: 'driver-b', role: 'driver', status: 'active' };
  await render();
  auth.profile = null;
  await render();
  await act(async () =>
    resolve({
      ...status,
      collecting: true,
      queuedEvents: 0,
      lastAcceptedAt: new Date().toISOString(),
    }),
  );
  expect(tracking.location.state.kind).toBe('inactive');
  expect(container.textContent).not.toContain('Last update');
});
it('does not read persisted tracking while authentication is loading', async () => {
  auth.loading = true;
  await render();
  expect(getStatus).not.toHaveBeenCalled();
});
it('stops a former account collector when the replacement driver has no owned session', async () => {
  await render();
  status = { statusVersion: 2, configured: false, collecting: false, queuedEvents: 0 };
  auth.profile = { id: 'driver-b', role: 'driver', status: 'active' };
  await render();
  expect(stop).toHaveBeenCalledOnce();
  expect(tracking.location.state.kind).toBe('inactive');
  expect(resume).not.toHaveBeenCalled();
});

it('does not restore status or keep collecting for a suspended driver', async () => {
  auth.profile = { id: 'driver-a', role: 'driver', status: 'suspended' };
  await render();
  expect(getStatus).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
  expect(tracking.location.state.kind).toBe('inactive');
});
it('ignores a stale restoration response after a new trip has activated', async () => {
  let resolve!: (value: NativeTrackingStatus) => void;
  getStatus.mockReturnValueOnce(
    new Promise<NativeTrackingStatus>((done) => {
      resolve = done;
    }),
  );
  await render();
  await act(async () => tracking.activateTracking('replacement-trip'));
  await act(async () =>
    resolve({ statusVersion: 2, configured: false, collecting: false, queuedEvents: 0 }),
  );
  expect(stop).not.toHaveBeenCalled();
  expect(tracking.trackingToken).toBe('native-service-active');
});

const pendingTrip = {
  id: 'trip-original',
  tenant_id: 'authority-a',
  driver_id: 'driver-record-a',
  status: 'active',
  updated_at: '2026-11-03T14:00:00Z',
} as DriverTrip;
function restoreSavedIntent(action: 'pause' | 'end' = 'pause') {
  auth.profile = { id: 'driver-a', role: 'driver', status: 'active', tenant_id: 'authority-a' };
  const item = savePendingTripAction('driver-a', 'authority-a', pendingTrip, action, null);
  localStorage.setItem(
    'safebus.pendingTripAction.v1:driver-a',
    JSON.stringify({ ...item, createdAt: Date.now() - 60_000 }),
  );
  sessionStorage.setItem('safebus.driverCollectionPaused', '1');
}
it('replays a restored pause once without resuming location collection', async () => {
  restoreSavedIntent();
  actions.fetch.mockResolvedValue(pendingTrip);
  actions.apply.mockResolvedValue('applied');
  await render();
  expect(actions.apply).toHaveBeenCalledOnce();
  expect(actions.apply).toHaveBeenCalledWith(
    expect.objectContaining({ tripId: 'trip-original', action: 'pause' }),
  );
  expect(loadPendingTripAction('driver-a')).toBeNull();
  expect(resume).not.toHaveBeenCalled();
});
it('discards an old intent without stopping or ending a different active trip', async () => {
  restoreSavedIntent('end');
  actions.fetch.mockResolvedValue({ ...pendingTrip, id: 'trip-new' });
  await render();
  expect(actions.apply).not.toHaveBeenCalled();
  expect(actions.end).not.toHaveBeenCalled();
  expect(window.SafeBusNativeTracking?.pause).not.toHaveBeenCalled();
  expect(loadPendingTripAction('driver-a')).toBeNull();
  expect(resume).not.toHaveBeenCalled();
});
it('does not replay another account or a non-driver role intent', async () => {
  restoreSavedIntent();
  auth.profile = { id: 'driver-a', role: 'guardian', status: 'active', tenant_id: 'authority-a' };
  await render();
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(actions.apply).not.toHaveBeenCalled();
  expect(actions.pause).not.toHaveBeenCalled();
  expect(tracking.pendingTripAction).toBeNull();
  expect(loadPendingTripAction('driver-a')).not.toBeNull();
});
it('keeps a network failure durable and blocks an accidental new activation', async () => {
  restoreSavedIntent();
  actions.fetch.mockRejectedValue(new Error('offline'));
  await render();
  expect(loadPendingTripAction('driver-a')).not.toBeNull();
  expect(actions.apply).not.toHaveBeenCalled();
  expect(actions.pause).not.toHaveBeenCalled();
  await expect(tracking.activateTracking('new-token')).rejects.toThrow('pending trip action');
  expect(resume).not.toHaveBeenCalled();
});

it('does not send or remove the old intent after the signed-in owner changes during a request', async () => {
  restoreSavedIntent();
  let resolve!: (trip: DriverTrip) => void;
  actions.fetch.mockReturnValue(
    new Promise<DriverTrip>((done) => {
      resolve = done;
    }),
  );
  await render();
  auth.profile = { id: 'driver-b', role: 'driver', status: 'active', tenant_id: 'authority-a' };
  await render();
  await act(async () => resolve(pendingTrip));
  expect(actions.apply).not.toHaveBeenCalled();
  expect(actions.pause).not.toHaveBeenCalled();
  expect(actions.apply).not.toHaveBeenCalled();
  expect(actions.end).not.toHaveBeenCalled();
  expect(loadPendingTripAction('driver-a')).not.toBeNull();
  expect(tracking.pendingTripAction).toBeNull();
});
it('retains an intent if the atomic endpoint detects a change after the client read', async () => {
  restoreSavedIntent();
  actions.fetch.mockResolvedValue(pendingTrip);
  actions.apply.mockResolvedValue('review');
  await render();
  expect(loadPendingTripAction('driver-a')).not.toBeNull();
  expect(tracking.pendingTripActionError).toContain('trip changed');
  expect(resume).not.toHaveBeenCalled();
});
