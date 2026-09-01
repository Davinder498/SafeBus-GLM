import { registerPlugin } from '@capacitor/core';
import { supabase, supabaseEnv } from '@/lib/supabase';
import { DRIVER_LOCATION_NOTICE_VERSION } from '@/lib/driverLocationDisclosure';
import type {
  NativeTrackingPermissionState,
  NativeTrackingStatus,
  SafeBusNativeTrackingBridge,
} from '@/types/nativeTracking';

interface DeviceInfo extends NativeTrackingPermissionState {
  installationId: string;
  deviceModel: string;
  appVersion: string;
}

interface StartOptions {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
  trackingToken: string;
  deviceCredential: string;
  authorizedUntil: number;
}

interface DriverTrackingNativePlugin {
  getDeviceInfo: () => Promise<DeviceInfo>;
  requestTrackingPermissions: () => Promise<DeviceInfo>;
  openAppSettings: () => Promise<void>;
  openLocationServices: () => Promise<void>;
  start: (options: StartOptions) => Promise<NativeTrackingStatus>;
  pause: () => Promise<NativeTrackingStatus>;
  resume: () => Promise<NativeTrackingStatus>;
  stop: () => Promise<NativeTrackingStatus>;
  getStatus: () => Promise<NativeTrackingStatus>;
}

interface DeviceRegistrationResult {
  deviceId: string;
  installationId: string;
  deviceCredential: string;
}

const nativePlugin = registerPlugin<DriverTrackingNativePlugin>('DriverTracking');

export function getNativeDeviceInfo(): Promise<DeviceInfo> {
  return nativePlugin.getDeviceInfo();
}

export function openNativeAppSettings(): Promise<void> {
  return nativePlugin.openAppSettings();
}

export function installNativeDriverTrackingBridge(): void {
  const bridge: SafeBusNativeTrackingBridge = {
    async prepare() {
      let device = await nativePlugin.getDeviceInfo();
      if (device.locationPermission === 'denied' || device.notificationPermission === 'denied') {
        device = await nativePlugin.requestTrackingPermissions();
      }
      return {
        locationPermission: device.locationPermission,
        notificationPermission: device.notificationPermission,
      };
    },
    openAppSettings: () => nativePlugin.openAppSettings(),
    openLocationServices: () => nativePlugin.openLocationServices(),
    async activate(trackingToken) {
      if (!supabase || !supabaseEnv.url || !supabaseEnv.anonKey) {
        throw new Error('Supabase is not configured for native tracking.');
      }
      const [device, sessionResult] = await Promise.all([
        nativePlugin.getDeviceInfo(),
        supabase.auth.getSession(),
      ]);
      if (device.locationPermission !== 'always') {
        throw new Error(
          device.locationPermission === 'foreground_only'
            ? 'Allow SafeBus location access all the time before starting a trip.'
            : 'Enable precise location access before starting a trip.',
        );
      }
      if (device.notificationPermission === 'denied') {
        throw new Error(
          'Allow SafeBus notifications so active trip tracking stays visible on this phone.',
        );
      }
      if (sessionResult.error || !sessionResult.data.session) {
        throw new Error('Your driver session expired. Sign in again before starting the trip.');
      }

      const { data, error } = await supabase.rpc('register_android_byod_tracking_device', {
        p_installation_id: device.installationId,
        p_device_model: device.deviceModel,
        p_app_version: device.appVersion,
        p_notice_version: DRIVER_LOCATION_NOTICE_VERSION,
      });
      if (error) throw new Error(error.message);
      const registration = data as unknown as DeviceRegistrationResult;
      if (
        !registration?.deviceCredential ||
        registration.installationId !== device.installationId
      ) {
        throw new Error('The tracking device could not be registered.');
      }

      const { error: bindError } = await supabase.rpc('bind_driver_tracking_device', {
        p_tracking_token: trackingToken,
        p_installation_id: device.installationId,
        p_device_credential: registration.deviceCredential,
      });
      if (bindError) throw new Error(bindError.message);

      await nativePlugin.start({
        supabaseUrl: supabaseEnv.url,
        anonKey: supabaseEnv.anonKey,
        accessToken: sessionResult.data.session.access_token,
        refreshToken: sessionResult.data.session.refresh_token,
        trackingToken,
        deviceCredential: registration.deviceCredential,
        authorizedUntil: Date.now() + 18 * 60 * 60 * 1_000,
      });
    },
    pause: () => nativePlugin.pause(),
    resume: () => nativePlugin.resume(),
    stop: () => nativePlugin.stop(),
    getStatus: () => nativePlugin.getStatus(),
  };
  window.SafeBusNativeTracking = bridge;
}
