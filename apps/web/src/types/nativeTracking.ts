export interface NativeTrackingStatus {
  configured: boolean;
  collecting: boolean;
  queuedEvents: number;
  lastAcceptedAt?: string;
}

export interface NativeTrackingPermissionState {
  locationPermission: 'always' | 'foreground_only' | 'denied' | 'disabled';
  notificationPermission: 'granted' | 'denied' | 'not_required';
}

export interface SafeBusNativeTrackingBridge {
  prepare: () => Promise<NativeTrackingPermissionState>;
  openAppSettings: () => Promise<void>;
  openLocationServices: () => Promise<void>;
  activate: (trackingToken: string) => Promise<void>;
  pause: () => Promise<NativeTrackingStatus>;
  resume: () => Promise<NativeTrackingStatus>;
  stop: () => Promise<NativeTrackingStatus>;
  getStatus: () => Promise<NativeTrackingStatus>;
}

declare global {
  interface Window {
    SafeBusNativeTracking?: SafeBusNativeTrackingBridge;
  }
}
