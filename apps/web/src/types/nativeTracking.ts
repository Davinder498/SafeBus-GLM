export interface NativeTrackingStatus {
  configured: boolean;
  collecting: boolean;
  queuedEvents: number | null;
  pendingDelivery?: boolean;
  lastAcceptedAt?: string;
  statusVersion?: 2;
  connected?: boolean;
  issue?:
    | 'authorization_expired'
    | 'authorization_rejected'
    | 'authentication_expired'
    | 'queue_unavailable'
    | 'queue_recovery_unavailable'
    | 'delivery_status_unavailable'
    | 'location_permission';
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
