import type { PushPermissionState } from '@safebus/types';

export interface SafeBusNativePushBridge {
  enable(): Promise<PushPermissionState>;
  refresh(): Promise<void>;
  deactivate(): Promise<void>;
  openSystemSettings(): Promise<void>;
  getPermissionState(): Promise<PushPermissionState>;
}

declare global {
  interface Window {
    SafeBusNativePush?: SafeBusNativePushBridge;
  }
}

export {};
