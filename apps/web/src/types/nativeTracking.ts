export interface NativeTrackingStatus {
  configured: boolean;
  collecting: boolean;
  queuedEvents: number;
  lastAcceptedAt?: string;
}

export interface SafeBusNativeTrackingBridge {
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
