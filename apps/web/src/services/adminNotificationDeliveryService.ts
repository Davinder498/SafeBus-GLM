import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { NotificationDeliverySummary, NotificationFailureCategoryEntry } from '@/types/notificationDelivery';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface SummaryRpcRow {
  pending_count: number;
  processing_count: number;
  delivered_count_recent: number;
  failed_count_recent: number;
  cancelled_count_recent: number;
  oldest_pending_age_seconds: number;
  recent_failure_categories: NotificationFailureCategoryEntry[];
}

function mapRow(row: SummaryRpcRow): NotificationDeliverySummary {
  return {
    pendingCount: row.pending_count,
    processingCount: row.processing_count,
    deliveredCountRecent: row.delivered_count_recent,
    failedCountRecent: row.failed_count_recent,
    cancelledCountRecent: row.cancelled_count_recent,
    oldestPendingAgeSeconds: row.oldest_pending_age_seconds,
    recentFailureCategories: Array.isArray(row.recent_failure_categories)
      ? row.recent_failure_categories
      : [],
  };
}

export async function fetchTenantNotificationDeliverySummary(
  recentWindowHours = 24,
): Promise<NotificationDeliverySummary> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_tenant_notification_delivery_summary', {
    p_recent_window_hours: recentWindowHours,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load notification delivery summary', error);
    }
    throw new Error('Unable to load notification delivery summary');
  }

  const row = (data?.[0] ?? {
    pending_count: 0,
    processing_count: 0,
    delivered_count_recent: 0,
    failed_count_recent: 0,
    cancelled_count_recent: 0,
    oldest_pending_age_seconds: 0,
    recent_failure_categories: [],
  }) as SummaryRpcRow;

  return mapRow(row);
}