// SafeBus Alberta - Phase 15B notification delivery operational summary types.
//
// These types intentionally contain NO personal information (no recipient emails,
// guardian names, student names, message bodies, provider message IDs, or outbox IDs).

export interface NotificationFailureCategoryEntry {
  category: string;
  count: number;
}

export interface NotificationDeliverySummary {
  pendingCount: number;
  processingCount: number;
  deliveredCountRecent: number;
  failedCountRecent: number;
  cancelledCountRecent: number;
  oldestPendingAgeSeconds: number;
  recentFailureCategories: NotificationFailureCategoryEntry[];
}

// Human-readable labels for normalized failure categories returned by the summary RPC.
export const NOTIFICATION_FAILURE_CATEGORY_LABELS: Record<string, string> = {
  temporary_provider_error: 'Temporary provider error',
  permanent_provider_error: 'Permanent provider error',
  provider_timeout: 'Provider timeout',
  missing_recipient_email: 'Missing recipient email',
  eligibility_revoked: 'Eligibility revoked',
  configuration_error: 'Configuration error',
  unknown: 'Unknown',
};

export function formatNotificationFailureCategory(category: string): string {
  return NOTIFICATION_FAILURE_CATEGORY_LABELS[category] ?? category;
}

export function formatOldestPendingAge(seconds: number): string {
  if (!seconds || seconds <= 0) return 'None';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = seconds / 3600;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}