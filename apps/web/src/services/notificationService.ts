import type {
  AndroidPushDevice,
  NotificationCategory,
  NotificationCursor,
  NotificationDeliveryHealthV2,
  NotificationPreferences,
  UserNotification,
} from '@safebus/types';
import { supabase } from '@/lib/supabase';

type Rpc = (name: string, args?: Record<string, unknown>) => PromiseLike<{
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

export async function fetchNotifications(options: {
  limit?: number;
  cursor?: NotificationCursor | null;
  unreadOnly?: boolean;
  category?: NotificationCategory | null;
} = {}): Promise<UserNotification[]> {
  const result = await clientRpc()('get_user_notifications', {
    p_limit: options.limit ?? 30,
    p_before_created_at: options.cursor?.createdAt ?? null,
    p_before_id: options.cursor?.id ?? null,
    p_unread_only: options.unreadOnly ?? false,
    p_category: options.category ?? null,
  });
  return assertData<NotificationRow[]>(result).map((row) => ({
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
  }));
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  return assertData<number>(await clientRpc()('get_user_notification_unread_count'));
}

export async function setNotificationsRead(ids: string[], read = true): Promise<number> {
  return assertData<number>(await clientRpc()('mark_user_notifications_read', { p_ids: ids, p_read: read }));
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

export async function saveNotificationPreferences(value: NotificationPreferences): Promise<NotificationPreferences> {
  return assertData<NotificationPreferences>(await clientRpc()('set_notification_preferences', {
    p_push_enabled: value.pushEnabled,
    p_quiet_hours_enabled: value.quietHoursEnabled,
    p_quiet_hours_start: value.quietHoursStart,
    p_quiet_hours_end: value.quietHoursEnd,
    p_timezone_override: value.timezoneOverride,
    p_urgent_bypass_quiet_hours: value.urgentBypassQuietHours,
    p_preview_mode: value.previewMode,
    p_categories: value.categories,
  }));
}

interface DeviceRow {
  id: string; installation_id: string; device_model: string | null; app_version: string | null;
  permission_state: AndroidPushDevice['permissionState']; status: AndroidPushDevice['status'];
  last_registered_at: string; last_seen_at: string;
}

export async function listOwnPushDevices(): Promise<AndroidPushDevice[]> {
  const rows = assertData<DeviceRow[]>(await clientRpc()('list_own_push_devices'));
  return rows.map((row) => ({ id: row.id, installationId: row.installation_id,
    deviceModel: row.device_model, appVersion: row.app_version, permissionState: row.permission_state,
    status: row.status, lastRegisteredAt: row.last_registered_at, lastSeenAt: row.last_seen_at }));
}

export async function revokeOwnPushDevice(id: string): Promise<boolean> {
  return assertData<boolean>(await clientRpc()('revoke_own_push_device', { p_device_id: id }));
}

export async function fetchNotificationDeliveryHealth(): Promise<NotificationDeliveryHealthV2> {
  return assertData<NotificationDeliveryHealthV2>(await clientRpc()('get_notification_delivery_health_v2'));
}
