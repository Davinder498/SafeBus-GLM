import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStatus: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  getDeviceInfo: vi.fn(),
  start: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mocks }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc },
  supabaseEnv: { url: 'https://placeholder.supabase.co', anonKey: 'placeholder-anon-key' },
}));
import { installNativeDriverTrackingBridge } from './driverTracking';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } },
    error: null,
  });
  installNativeDriverTrackingBridge();
  mocks.getDeviceInfo.mockResolvedValue({
    installationId: 'installation-a',
    locationPermission: 'always',
    notificationPermission: 'granted',
    deviceModel: 'Synthetic device',
    appVersion: '1.0.0',
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === 'register_android_byod_tracking_device'
        ? { installationId: 'installation-a', deviceCredential: 'synthetic-device-credential' }
        : null,
  }));
});
afterEach(() => {
  delete window.SafeBusNativeTracking;
});
it('uses the current signed-in driver to scope status reads and resume', async () => {
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
  expect(mocks.stop).toHaveBeenCalledWith({});
});
it('still stops collection when Auth is unavailable, while status reads fail closed', async () => {
  mocks.getSession.mockRejectedValue(new Error('Auth unavailable'));
  await window.SafeBusNativeTracking!.pause();
  await window.SafeBusNativeTracking!.stop();
  expect(mocks.pause).toHaveBeenCalledWith({});
  expect(mocks.stop).toHaveBeenCalledWith({});
  await expect(window.SafeBusNativeTracking!.getStatus()).rejects.toThrow('Auth unavailable');
  expect(mocks.getStatus).not.toHaveBeenCalled();
});

it.each(['pause', 'stop'] as const)(
  'acknowledges %s without waiting for a hung Auth refresh',
  async (method) => {
    mocks.getSession.mockReturnValue(new Promise(() => undefined));
    mocks[method].mockResolvedValue({
      statusVersion: 2,
      collecting: false,
      configured: false,
      queuedEvents: 0,
    });
    await expect(window.SafeBusNativeTracking![method]()).resolves.toMatchObject({
      collecting: false,
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks[method]).toHaveBeenCalledWith({});
  },
);

it.each(['pause', 'stop'] as const)(
  'a %s cancels an earlier resume waiting on Auth',
  async (method) => {
    let resolve!: (value: unknown) => void;
    mocks.getSession.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const resumeResult = expect(window.SafeBusNativeTracking!.resume()).rejects.toThrow(
      'Location sharing was stopped',
    );
    await window.SafeBusNativeTracking![method]();
    resolve({ data: { session: { user: { id: 'driver-a' } } }, error: null });
    await resumeResult;
    expect(mocks.resume).not.toHaveBeenCalled();
  },
);

it.each(['registration', 'binding'] as const)(
  'a stop cancels activation waiting on %s',
  async (phase) => {
    let resolve!: (value: unknown) => void;
    const paused = new Promise((done) => {
      resolve = done;
    });
    const waitOn =
      phase === 'registration'
        ? 'register_android_byod_tracking_device'
        : 'bind_driver_tracking_device';
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, ...args) =>
      name === waitOn ? paused : implementation(name, ...args),
    );
    const activation = expect(
      window.SafeBusNativeTracking!.activate('synthetic-tracking-token'),
    ).rejects.toThrow('Location sharing was stopped');
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(waitOn, expect.any(Object)));
    await window.SafeBusNativeTracking!.stop();
    resolve({
      error: null,
      data: { installationId: 'installation-a', deviceCredential: 'synthetic-device-credential' },
    });
    await activation;
    expect(mocks.start).not.toHaveBeenCalled();
  },
);

it('permits an explicit new resume after a stop', async () => {
  await window.SafeBusNativeTracking!.stop();
  await window.SafeBusNativeTracking!.resume();
  expect(mocks.resume).toHaveBeenCalledWith({ profileId: 'driver-a' });
});

it.each(['pause', 'stop'] as const)(
  'propagates native %s failure without reading account metadata',
  async (method) => {
    mocks[method].mockRejectedValue(new Error('Secure local stop failed'));
    await expect(window.SafeBusNativeTracking![method]()).rejects.toThrow(
      'Secure local stop failed',
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  },
);
