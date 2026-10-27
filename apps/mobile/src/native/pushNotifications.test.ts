import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, (value: unknown) => void>,
  permissions: vi.fn(),
  register: vi.fn(),
  rpc: vi.fn(),
  session: vi.fn(),
  device: vi.fn(),
  unregister: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: mocks.permissions,
    requestPermissions: mocks.request,
    register: mocks.register,
    unregister: mocks.unregister,
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn(async (name: string, listener: (value: unknown) => void) => {
      mocks.listeners[name] = listener;
    }),
  },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.session }, rpc: mocks.rpc },
}));
vi.mock('./driverTracking', () => ({
  getNativeDeviceInfo: mocks.device,
  openNativeAppSettings: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.listeners = {};
  mocks.permissions.mockResolvedValue({ receive: 'granted' });
  mocks.register.mockResolvedValue(undefined);
  mocks.unregister.mockResolvedValue(undefined);
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'synthetic-profile' } } } });
  mocks.device.mockResolvedValue({
    pushConfigured: true,
    installationId: 'synthetic-installation',
    deviceModel: 'test',
    appVersion: 'test',
  });
  mocks.rpc.mockResolvedValue({ data: 'synthetic-device', error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  delete window.SafeBusNativePush;
});
async function bridge() {
  const { installNativePushBridge } = await import('./pushNotifications');
  await installNativePushBridge();
  return window.SafeBusNativePush!;
}

describe('confirmed Android push registration', () => {
  it('persists the exact tapped notification for cold-start and sign-in recovery', async () => {
    await bridge();
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    const noticeId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    mocks.listeners.pushNotificationActionPerformed({
      notification: {
        data: { notificationId: noticeId, destination: 'https://untrusted.example' },
      },
    });
    expect(assign).toHaveBeenCalledWith(`/notifications?notification=${noticeId}`);
    expect(sessionStorage.getItem('safebus.pendingNotificationPath')).toBe(
      `/notifications?notification=${noticeId}`,
    );
  });
  it('refreshes the authorized inbox when a push arrives in the foreground', async () => {
    await bridge();
    const listener = vi.fn();
    window.addEventListener('safebus:push-received', listener);
    try {
      mocks.listeners.pushNotificationReceived({ data: { notificationId: 'notice' } });
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('safebus:push-received', listener);
    }
  });
  it('keeps unconfigured Firebase builds unavailable without registering or ending the session', async () => {
    mocks.device.mockResolvedValue({ pushConfigured: false });
    const native = await bridge();
    expect(native.available).toBe(false);
    await expect(native.enable()).resolves.toBe('denied');
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('waits for the token to persist before reporting enabled and deduplicates concurrent refresh', async () => {
    const native = await bridge();
    let complete: (value: { data: string; error: null }) => void = () => undefined;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let enabled = false;
    const enable = native.enable().then((value) => {
      enabled = true;
      return value;
    });
    const refresh = native.refresh();
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    mocks.listeners.registration({ value: 'synthetic-token' });
    await vi.waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'register_android_push_device',
        expect.objectContaining({ p_fcm_token: 'synthetic-token' }),
      ),
    );
    expect(enabled).toBe(false);
    complete({ data: 'synthetic-device', error: null });
    await expect(enable).resolves.toBe('granted');
    await refresh;
    await native.deactivate();
    expect(mocks.rpc).toHaveBeenLastCalledWith('revoke_own_push_device', {
      p_device_id: 'synthetic-device',
    });
  });
  it('reports database registration failures instead of reporting enabled', async () => {
    const native = await bridge();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'synthetic database failure' } });
    const enabled = expect(native.enable()).rejects.toThrow('Could not register this phone');
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
    mocks.listeners.registration({ value: 'synthetic-token' });
    await enabled;
  });
  it('reports Firebase registration errors', async () => {
    const native = await bridge();
    const enabled = expect(native.enable()).rejects.toThrow('Could not connect this phone');
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
    mocks.listeners.registrationError({ error: 'synthetic error' });
    await enabled;
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('times out a missing token callback and allows retry', async () => {
    const native = await bridge();
    vi.useFakeTimers();
    const enabled = expect(native.enable()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20_001);
    await enabled;
    const retry = native.enable();
    await vi.advanceTimersByTimeAsync(1);
    mocks.listeners.registration({ value: 'synthetic-token' });
    await expect(retry).resolves.toBe('granted');
  });
  it('preserves Android permission denial without registering a token', async () => {
    const native = await bridge();
    mocks.permissions.mockResolvedValue({ receive: 'denied' });
    await expect(native.enable()).resolves.toBe('permanently_denied');
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not let a timed-out token write complete a later registration attempt', async () => {
    const native = await bridge();
    vi.useFakeTimers();
    let persistOld: (value: { data: string; error: null }) => void = () => undefined;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          persistOld = resolve;
        }),
    );
    const first = expect(native.enable()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1);
    mocks.listeners.registration({ value: 'synthetic-old-token' });
    await vi.advanceTimersByTimeAsync(20_001);
    await first;
    let completed = false;
    const retry = native.enable().then((state) => {
      completed = true;
      return state;
    });
    await vi.advanceTimersByTimeAsync(1);
    persistOld({ data: 'synthetic-device', error: null });
    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toBe(false);
    mocks.listeners.registration({ value: 'synthetic-new-token' });
    await expect(retry).resolves.toBe('granted');
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'register_android_push_device',
      expect.objectContaining({ p_fcm_token: 'synthetic-new-token' }),
    );
  });
  it('cancels pending registration and ignores later callbacks after disabling or signing out', async () => {
    const native = await bridge();
    const enabled = expect(native.enable()).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
    await native.deactivate();
    await enabled;
    mocks.listeners.registration({ value: 'synthetic-late-token' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.unregister).toHaveBeenCalled();
  });
});
