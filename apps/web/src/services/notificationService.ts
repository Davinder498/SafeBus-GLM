import type {
  AndroidPushDevice,
  DriverDeliveryPreferences,
  GuardianDeliveryPreferences,
  NotificationCategory,
  NotificationCursor,
  NotificationDeliveryHealthV2,
  NotificationPreferences,
  UserNotification,
} from '@safebus/types';
import { supabase } from '@/lib/supabase';

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

function clientRpc(): Rpc {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase.rpc.bind(supabase) as unknown as Rpc;
}

function assertData<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeliveryChannelHealth(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    ['pending', 'retrying', 'failed'].every((key) => typeof value[key] === 'number') &&
    (value.oldestPendingAt === null || typeof value.oldestPendingAt === 'string')
  );
}

function isNotificationDeliveryHealth(value: unknown): value is NotificationDeliveryHealthV2 {
  if (
    !isRecord(value) ||
    !isDeliveryChannelHealth(value.email) ||
    !isDeliveryChannelHealth(value.push) ||
    !isRecord(value.push)
  )
    return false;
  return (
    typeof value.push.invalidDevices === 'number' &&
    Array.isArray(value.push.recentFailureCategories) &&
    value.push.recentFailureCategories.every(
      (item) =>
        isRecord(item) && typeof item.category === 'string' && typeof item.count === 'number',
    )
  );
}

interface NotificationRow {
  id: string;
  event_type: UserNotification['eventType'];
  category: UserNotification['category'];
  severity: UserNotification['severity'];
  title: string;
  body: string;
  occurred_at: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
  destination_path: string;
}

function mapNotification(row: NotificationRow): UserNotification {
  return {
    id: row.id,
    eventType: row.event_type,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    readAt: row.read_at,
    archivedAt: row.archived_at,
    destinationPath: row.destination_path,
  };
}

export async function fetchNotificationDetail(id: string): Promise<UserNotification | null> {
  const rows = assertData<NotificationRow[]>(
    await clientRpc()('get_user_notification_detail', { p_id: id }),
  );
  return rows[0] ? mapNotification(rows[0]) : null;
}

export async function fetchNotifications(
  options: {
    limit?: number;
    cursor?: NotificationCursor | null;
    unreadOnly?: boolean;
    category?: NotificationCategory | null;
  } = {},
): Promise<UserNotification[]> {
  const result = await clientRpc()('get_user_notifications', {
    p_limit: options.limit ?? 30,
    p_before_created_at: options.cursor?.createdAt ?? null,
    p_before_id: options.cursor?.id ?? null,
    p_unread_only: options.unreadOnly ?? false,
    p_category: options.category ?? null,
  });
  return assertData<NotificationRow[]>(result).map(mapNotification);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  return assertData<number>(await clientRpc()('get_user_notification_unread_count'));
}

export async function setNotificationsRead(ids: string[], read = true): Promise<number> {
  return assertData<number>(
    await clientRpc()('mark_user_notifications_read', { p_ids: ids, p_read: read }),
  );
}

export async function markAllNotificationsRead(): Promise<number> {
  return assertData<number>(await clientRpc()('mark_all_user_notifications_read'));
}

export async function archiveNotifications(ids: string[]): Promise<number> {
  return assertData<number>(await clientRpc()('archive_user_notifications', { p_ids: ids }));
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return assertData<NotificationPreferences>(await clientRpc()('get_notification_preferences'));
}

export async function saveNotificationPreferences(
  value: NotificationPreferences,
): Promise<NotificationPreferences> {
  return assertData<NotificationPreferences>(
    await clientRpc()('set_notification_preferences', {
      p_push_enabled: value.pushEnabled,
      p_quiet_hours_enabled: value.quietHoursEnabled,
      p_quiet_hours_start: value.quietHoursStart,
      p_quiet_hours_end: value.quietHoursEnd,
      p_timezone_override: value.timezoneOverride,
      p_urgent_bypass_quiet_hours: value.urgentBypassQuietHours,
      p_preview_mode: value.previewMode,
      p_categories: value.categories,
    }),
  );
}

interface GuardianDeliveryPreferencesRowV3 {
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  pickup_dropoff: { in_app: boolean; push: boolean; email: boolean };
  trip_updates: { in_app: boolean; push: boolean; email: boolean };
  operational_alerts: { in_app: boolean; push: boolean; email: boolean };
}

function mapGuardianDeliveryPreferences(
  value: GuardianDeliveryPreferencesRowV3,
): GuardianDeliveryPreferences {
  const channel = (group: GuardianDeliveryPreferencesRowV3['pickup_dropoff']) => ({
    inApp: group.in_app,
    push: group.push,
    email: group.email,
  });
  return {
    inAppEnabled: value.in_app_enabled,
    pushEnabled: value.push_enabled,
    emailEnabled: value.email_enabled,
    pickupDropoff: channel(value.pickup_dropoff),
    tripUpdates: channel(value.trip_updates),
    operationalAlerts: channel(value.operational_alerts),
  };
}

export async function fetchGuardianDeliveryPreferences(): Promise<GuardianDeliveryPreferences> {
  const value = assertData<GuardianDeliveryPreferencesRowV3>(
    await clientRpc()('get_guardian_delivery_preferences_v3'),
  );
  return mapGuardianDeliveryPreferences(value);
}

export async function saveGuardianDeliveryPreferences(
  value: GuardianDeliveryPreferences,
): Promise<GuardianDeliveryPreferences> {
  const channel = (group: GuardianDeliveryPreferences['pickupDropoff']) => ({
    in_app: group.inApp,
    push: group.push,
    email: group.email,
  });
  const result = assertData<GuardianDeliveryPreferencesRowV3>(
    await clientRpc()('set_guardian_delivery_preferences_v3', {
      p_preferences: {
        in_app_enabled: value.inAppEnabled,
        push_enabled: value.pushEnabled,
        email_enabled: value.emailEnabled,
        pickup_dropoff: channel(value.pickupDropoff),
        trip_updates: channel(value.tripUpdates),
        operational_alerts: channel(value.operationalAlerts),
      },
    }),
  );
  return mapGuardianDeliveryPreferences(result);
}

interface DriverDeliveryPreferencesRow {
  push_enabled: boolean;
  email_enabled: boolean;
  assignment_alerts: { push: boolean; email: boolean };
}

function mapDriverDeliveryPreferences(
  value: DriverDeliveryPreferencesRow,
): DriverDeliveryPreferences {
  return {
    pushEnabled: value.push_enabled,
    emailEnabled: value.email_enabled,
    assignmentAlerts: value.assignment_alerts,
  };
}

export async function fetchDriverDeliveryPreferences(): Promise<DriverDeliveryPreferences> {
  const value = assertData<DriverDeliveryPreferencesRow>(
    await clientRpc()('get_driver_delivery_preferences'),
  );
  return mapDriverDeliveryPreferences(value);
}

export async function saveDriverDeliveryPreferences(
  value: DriverDeliveryPreferences,
): Promise<DriverDeliveryPreferences> {
  const result = assertData<DriverDeliveryPreferencesRow>(
    await clientRpc()('set_driver_delivery_preferences', {
      p_preferences: {
        push_enabled: value.pushEnabled,
        email_enabled: value.emailEnabled,
        assignment_alerts: value.assignmentAlerts,
      },
    }),
  );
  return mapDriverDeliveryPreferences(result);
}

interface DeviceRow {
  id: string;
  installation_id: string;
  device_model: string | null;
  app_version: string | null;
  permission_state: AndroidPushDevice['permissionState'];
  status: AndroidPushDevice['status'];
  last_registered_at: string;
  last_seen_at: string;
}

export async function listOwnPushDevices(): Promise<AndroidPushDevice[]> {
  const rows = assertData<DeviceRow[]>(await clientRpc()('list_own_push_devices'));
  return rows.map((row) => ({
    id: row.id,
    installationId: row.installation_id,
    deviceModel: row.device_model,
    appVersion: row.app_version,
    permissionState: row.permission_state,
    status: row.status,
    lastRegisteredAt: row.last_registered_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function revokeOwnPushDevice(id: string): Promise<boolean> {
  return assertData<boolean>(await clientRpc()('revoke_own_push_device', { p_device_id: id }));
}

export async function fetchNotificationDeliveryHealth(): Promise<NotificationDeliveryHealthV2> {
  const data = assertData<unknown>(await clientRpc()('get_notification_delivery_health_v2'));
  if (!isNotificationDeliveryHealth(data))
    throw new Error('Notification delivery health returned an invalid response.');
  return data;
}
