import {
  PushNotifications,
  type ActionPerformed,
  type PermissionStatus,
  type Token,
} from '@capacitor/push-notifications';
import type { PushPermissionState } from '@safebus/types';
import { supabase } from '@/lib/supabase';
import type { SafeBusNativePushBridge } from '@/types/nativePush';
import { getNativeDeviceInfo, openNativeAppSettings } from './driverTracking';

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
let activeDeviceId: string | null = null;
let listenersInstalled = false;
let registration: Promise<void> | null = null;
let finishRegistration: ((error?: Error) => void) | null = null;
let tokensAllowed = false;
let tokenPersistence: Promise<void> | null = null;

function installUnavailableBridge(): void {
  window.SafeBusNativePush = {
    available: false,
    async enable() {
      return 'denied';
    },
    async refresh() {},
    async deactivate() {},
    openSystemSettings: openNativeAppSettings,
    async getPermissionState() {
      return 'denied';
    },
  };
}

function permissionState(status: PermissionStatus): PushPermissionState {
  if (status.receive === 'granted') return 'granted';
  if (status.receive === 'denied') return 'permanently_denied';
  return 'prompt';
}

async function registerToken(token: Token): Promise<void> {
  if (!supabase) throw new Error('Push registration is unavailable.');
  const [{ data: sessionData }, device, permissions] = await Promise.all([
    supabase.auth.getSession(),
    getNativeDeviceInfo(),
    PushNotifications.checkPermissions(),
  ]);
  if (!sessionData.session) throw new Error('Sign in before enabling push notifications.');
  if (permissionState(permissions) !== 'granted')
    throw new Error('Push permission is turned off in Android settings.');
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const result = await rpc('register_android_push_device', {
    p_installation_id: device.installationId,
    p_fcm_token: token.value,
    p_device_model: device.deviceModel,
    p_app_version: device.appVersion,
    p_permission_state: 'granted',
  });
  if (result.error || typeof result.data !== 'string' || !result.data)
    throw new Error('Could not register this phone for push notifications. Try again.');
  activeDeviceId = result.data as string;
}

function registerAndConfirm(): Promise<void> {
  if (registration) return registration;
  tokensAllowed = true;
  let complete: ((error?: Error) => void) | null = null;
  const pending = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(
      () =>
        complete?.(
          new Error('Push registration timed out. Check your connection and try again.'),
        ),
      20_000,
    );
    complete = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (finishRegistration === complete) finishRegistration = null;
      if (error) reject(error);
      else resolve();
    };
    finishRegistration = complete;
  });
  registration = pending.finally(() => {
    registration = null;
  });
  void PushNotifications.register().catch(() =>
    complete?.(
      new Error('Could not connect this phone to push notifications. Try again.'),
    ),
  );
  return registration;
}

function openNotification(action: ActionPerformed): void {
  const id =
    typeof action.notification.data?.notificationId === 'string'
      ? action.notification.data.notificationId
      : null;
  const path = id ? `/notifications?notification=${encodeURIComponent(id)}` : '/notifications';
  sessionStorage.setItem('safebus.pendingNotificationPath', path);
  window.location.assign(path);
}

async function installListeners(): Promise<void> {
  if (listenersInstalled) return;
  listenersInstalled = true;
  await PushNotifications.addListener('registration', (token) => {
    if (!tokensAllowed) return;
    const complete = finishRegistration;
    const persistence = (tokenPersistence ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => registerToken(token));
    tokenPersistence = persistence;
    void persistence
      .then(() => complete?.())
      .catch((error: unknown) => {
        complete?.(
          error instanceof Error ? error : new Error('Push registration failed. Try again.'),
        );
      })
      .finally(() => {
        if (tokenPersistence === persistence) tokenPersistence = null;
      });
  });
  await PushNotifications.addListener('registrationError', () => {
    finishRegistration?.(
      new Error('Could not connect this phone to push notifications. Try again.'),
    );
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', openNotification);
  await PushNotifications.addListener('pushNotificationReceived', () => {
    window.dispatchEvent(new CustomEvent('safebus:push-received'));
  });
}

async function createChannels(): Promise<void> {
  await Promise.all([
    PushNotifications.createChannel({
      id: 'urgent_operations',
      name: 'Urgent operations',
      description: 'Cancellations, missing service, road closures and mechanical alerts',
      importance: 5,
      visibility: 0,
      vibration: true,
    }),
    PushNotifications.createChannel({
      id: 'trip_updates',
      name: 'Trip updates',
      description: 'Trip status and bus-service updates',
      importance: 3,
      visibility: 0,
      vibration: true,
    }),
    PushNotifications.createChannel({
      id: 'assignments',
      name: 'Assignments',
      description: 'Driver assignment changes',
      importance: 3,
      visibility: 0,
      vibration: true,
    }),
  ]);
}

export async function installNativePushBridge(): Promise<void> {
  let pushConfigured = false;
  try {
    pushConfigured = (await getNativeDeviceInfo()).pushConfigured;
  } catch {
    installUnavailableBridge();
    return;
  }
  if (!pushConfigured) {
    installUnavailableBridge();
    return;
  }

  await installListeners();
  await createChannels();
  const bridge: SafeBusNativePushBridge = {
    available: true,
    async enable() {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale')
        status = await PushNotifications.requestPermissions();
      const state = permissionState(status);
      if (state === 'granted') await registerAndConfirm();
      return state;
    },
    async refresh() {
      const status = await PushNotifications.checkPermissions();
      if (permissionState(status) === 'granted') await registerAndConfirm();
    },
    async deactivate() {
      tokensAllowed = false;
      finishRegistration?.(new Error('Push registration was cancelled.'));
      await tokenPersistence?.catch(() => undefined);
      if (activeDeviceId && supabase) {
        const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
        await rpc('revoke_own_push_device', { p_device_id: activeDeviceId });
      }
      activeDeviceId = null;
      await PushNotifications.unregister();
    },
    openSystemSettings: openNativeAppSettings,
    async getPermissionState() {
      return permissionState(await PushNotifications.checkPermissions());
    },
  };
  window.SafeBusNativePush = bridge;
}
