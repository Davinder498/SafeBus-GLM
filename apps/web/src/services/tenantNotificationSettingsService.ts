import type { TenantNotificationSettings } from '@safebus/types';
import { supabase, supabaseConfigError } from '@/lib/supabase';

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Notification settings returned an invalid response.');
  }
  return value as Record<string, unknown>;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Notification settings returned an invalid response.');
  }
  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Notification settings returned an invalid response.');
  }
  return value;
}

function normalizeSettings(value: unknown): TenantNotificationSettings {
  const data = record(value);
  const privacyReviewStatus = requiredString(data.privacy_review_status);
  if (!['pending', 'approved', 'rejected'].includes(privacyReviewStatus)) {
    throw new Error('Notification settings returned an invalid response.');
  }
  if (data.privacy_approved_at !== null && typeof data.privacy_approved_at !== 'string') {
    throw new Error('Notification settings returned an invalid response.');
  }

  return {
    notificationsEnabled: requiredBoolean(data.notifications_enabled),
    pushNotificationsEnabled: requiredBoolean(data.push_notifications_enabled),
    emailEffective: requiredBoolean(data.email_effective),
    pushEffective: requiredBoolean(data.push_effective),
    privacyReviewStatus: privacyReviewStatus as TenantNotificationSettings['privacyReviewStatus'],
    privacyApprovedAt: data.privacy_approved_at,
    updatedAt: requiredString(data.updated_at),
  };
}

export async function fetchTenantNotificationSettings(): Promise<TenantNotificationSettings> {
  const { data, error } = await client().rpc('get_tenant_notification_settings');
  if (error) throw new Error('Unable to load tenant notification settings.');
  return normalizeSettings(data);
}

export async function setTenantNotificationDeliveryEnabled(
  enabled: boolean,
): Promise<TenantNotificationSettings> {
  const { data, error } = await client().rpc('set_tenant_notification_delivery_enabled', {
    p_enabled: enabled,
  });
  if (error) {
    throw new Error(
      enabled
        ? 'External delivery could not be enabled. Confirm that privacy review is approved.'
        : 'External delivery could not be paused.',
    );
  }
  return normalizeSettings(data);
}

export async function setTenantPushNotificationsEnabled(
  enabled: boolean,
): Promise<TenantNotificationSettings> {
  const { data, error } = await client().rpc('set_tenant_push_notifications_enabled', {
    p_enabled: enabled,
  });
  if (error) throw new Error('Android push delivery could not be updated.');
  return normalizeSettings(data);
}
