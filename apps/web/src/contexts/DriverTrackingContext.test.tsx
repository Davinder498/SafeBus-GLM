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
  } | null,
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
    pause: vi.fn(),
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
