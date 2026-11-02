import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStatus: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mocks }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  supabaseEnv: {},
}));
import { installNativeDriverTrackingBridge } from './driverTracking';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } },
    error: null,
  });
  installNativeDriverTrackingBridge();
});
afterEach(() => {
  delete window.SafeBusNativeTracking;
});
it('uses the current signed-in driver to scope every status read and collection control', async () => {
  await window.SafeBusNativeTracking!.getStatus();
  expect(mocks.getStatus).toHaveBeenLastCalledWith({ profileId: 'driver-a' });
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-b' } } },
    error: null,
  });
  await window.SafeBusNativeTracking!.resume();
  expect(mocks.resume).toHaveBeenLastCalledWith({ profileId: 'driver-b' });
});
it('returns no saved driver metadata and never resumes without a session', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await window.SafeBusNativeTracking!.getStatus()).toEqual({
    statusVersion: 2,
    configured: false,
    collecting: false,
    queuedEvents: 0,
  });
  await window.SafeBusNativeTracking!.resume();
  expect(mocks.getStatus).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
  await window.SafeBusNativeTracking!.stop();
  expect(mocks.stop).toHaveBeenCalledWith({ profileId: undefined });
});
it('still stops collection when Auth is unavailable, while status reads fail closed', async () => {
  mocks.getSession.mockRejectedValue(new Error('Auth unavailable'));
  await window.SafeBusNativeTracking!.pause();
  await window.SafeBusNativeTracking!.stop();
  expect(mocks.pause).toHaveBeenCalledWith({ profileId: undefined });
  expect(mocks.stop).toHaveBeenCalledWith({ profileId: undefined });
  await expect(window.SafeBusNativeTracking!.getStatus()).rejects.toThrow('Auth unavailable');
  expect(mocks.getStatus).not.toHaveBeenCalled();
});
