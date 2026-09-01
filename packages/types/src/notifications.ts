export type NotificationEventType =
  | 'student_picked_up'
  | 'student_dropped_off'
  | 'trip_started'
  | 'trip_completed'
  | 'trip_cancelled'
  | 'trip_late'
  | 'trip_missing'
  | 'traffic_disruption'
  | 'weather_disruption'
  | 'road_closure'
  | 'mechanical_disruption'
  | 'driver_assignment_created'
  | 'driver_assignment_changed'
  | 'driver_assignment_ended'
  | 'student_service_changed'
  | 'guardian_access_changed'
  | 'delivery_health_incident'
  | 'provider_configuration_incident';

export type NotificationCategory =
  | 'pickup_dropoff'
  | 'trip_status'
  | 'service_changes'
  | 'assignments'
  | 'operations'
  | 'delivery_health'
  | 'platform';

export type NotificationSeverity = 'info' | 'warning' | 'urgent';
export type NotificationPreviewMode = 'generic' | 'limited';
export type PushPermissionState = 'prompt' | 'granted' | 'denied' | 'permanently_denied';
export type PushDeviceStatus = 'active' | 'revoked' | 'invalid' | 'stale';
export type PushDeliveryState = 'pending' | 'processing' | 'retry' | 'delivered' | 'failed' | 'cancelled';

export interface UserNotification {
  id: string;
  eventType: NotificationEventType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  destinationPath: string;
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  timezoneOverride: string | null;
  urgentBypassQuietHours: boolean;
  previewMode: NotificationPreviewMode;
  categories: Partial<Record<Exclude<NotificationCategory, 'platform'>, boolean>>;
}

export interface AndroidPushDevice {
  id: string;
  installationId: string;
  deviceModel: string | null;
  appVersion: string | null;
  permissionState: PushPermissionState;
  status: PushDeviceStatus;
  lastRegisteredAt: string;
  lastSeenAt: string;
}

export interface NotificationDeliveryChannelHealth {
  pending: number;
  retrying: number;
  failed: number;
  oldestPendingAt: string | null;
}

export interface NotificationDeliveryHealthV2 {
  email: NotificationDeliveryChannelHealth;
  push: NotificationDeliveryChannelHealth & {
    invalidDevices: number;
    recentFailureCategories: Array<{ category: string; count: number }>;
  };
}
