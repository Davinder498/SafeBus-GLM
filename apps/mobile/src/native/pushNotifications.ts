import { PushNotifications, type ActionPerformed, type PermissionStatus, type Token } from '@capacitor/push-notifications';
import type { PushPermissionState } from '@safebus/types';
import { supabase } from '@/lib/supabase';
import type { SafeBusNativePushBridge } from '@/types/nativePush';
import { getNativeDeviceInfo, openNativeAppSettings } from './driverTracking';

type Rpc = (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
let activeDeviceId: string | null = null;
let listenersInstalled = false;

function permissionState(status: PermissionStatus): PushPermissionState {
  if (status.receive === 'granted') return 'granted';
  if (status.receive === 'denied') return 'permanently_denied';
  return 'prompt';
}

async function registerToken(token: Token): Promise<void> {
  if (!supabase) return;
  const [{ data: sessionData }, device, permissions] = await Promise.all([
    supabase.auth.getSession(), getNativeDeviceInfo(), PushNotifications.checkPermissions(),
  ]);
  if (!sessionData.session || permissionState(permissions) !== 'granted') return;
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const result = await rpc('register_android_push_device', {
    p_installation_id: device.installationId,
    p_fcm_token: token.value,
    p_device_model: device.deviceModel,
    p_app_version: device.appVersion,
    p_permission_state: 'granted',
  });
  if (result.error) throw new Error(result.error.message);
  activeDeviceId = result.data as string;
}

function openNotification(action: ActionPerformed): void {
  const id = typeof action.notification.data?.notificationId === 'string' ? action.notification.data.notificationId : null;
  const path = id ? `/notifications?notification=${encodeURIComponent(id)}` : '/notifications';
  sessionStorage.setItem('safebus.pendingNotificationPath', path);
  window.location.assign(path);
}

async function installListeners(): Promise<void> {
  if (listenersInstalled) return;
  listenersInstalled = true;
  await PushNotifications.addListener('registration', (token) => { void registerToken(token); });
  await PushNotifications.addListener('registrationError', () => { activeDeviceId = null; });
  await PushNotifications.addListener('pushNotificationActionPerformed', openNotification);
  await PushNotifications.addListener('pushNotificationReceived', () => {
    window.dispatchEvent(new CustomEvent('safebus:push-received'));
  });
}

async function createChannels(): Promise<void> {
  await Promise.all([
    PushNotifications.createChannel({ id: 'urgent_operations', name: 'Urgent operations', description: 'Cancellations, missing service, road closures and mechanical alerts', importance: 5, visibility: 0, vibration: true }),
    PushNotifications.createChannel({ id: 'trip_updates', name: 'Trip updates', description: 'Trip status and bus-service updates', importance: 3, visibility: 0, vibration: true }),
    PushNotifications.createChannel({ id: 'assignments', name: 'Assignments', description: 'Driver assignment changes', importance: 3, visibility: 0, vibration: true }),
  ]);
}

export async function installNativePushBridge(): Promise<void> {
  await installListeners();
  await createChannels();
  const bridge: SafeBusNativePushBridge = {
    async enable() {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') status = await PushNotifications.requestPermissions();
      const state = permissionState(status);
      if (state === 'granted') await PushNotifications.register();
      return state;
    },
    async refresh() {
      const status = await PushNotifications.checkPermissions();
      if (permissionState(status) === 'granted') await PushNotifications.register();
    },
    async deactivate() {
      if (activeDeviceId && supabase) {
        const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
        await rpc('revoke_own_push_device', { p_device_id: activeDeviceId });
      }
      activeDeviceId = null;
      await PushNotifications.unregister();
    },
    openSystemSettings: openNativeAppSettings,
    async getPermissionState() { return permissionState(await PushNotifications.checkPermissions()); },
  };
  window.SafeBusNativePush = bridge;
}
