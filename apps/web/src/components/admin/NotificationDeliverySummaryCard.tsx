import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { fetchTenantNotificationDeliverySummary } from '@/services/adminNotificationDeliveryService';
import {
  formatNotificationFailureCategory,
  formatOldestPendingAge,
  type NotificationDeliverySummary,
} from '@/types/notificationDelivery';

// SafeBus Alberta - Phase 15B tenant-admin operational notification delivery summary.
//
// Shows ONLY safe aggregate counts and normalized failure categories for the
// current tenant. No recipient emails, guardian/student names, message bodies,
// provider message IDs, or outbox IDs are displayed. Platform Super Admin is
// denied at the RPC level. This card is intentionally read-only: there is no
// manual resend or outbox mutation control.

export function NotificationDeliverySummaryCard() {
  const [summary, setSummary] = useState<NotificationDeliverySummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTenantNotificationDeliverySummary(24)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy-900">Notification delivery</h2>
        <div className="mt-3">
          <DataState
            title="Summary unavailable"
            message="You may lack an operational admin role, or the notification summary is temporarily unavailable."
          />
        </div>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy-900">Notification delivery</h2>
        <div className="mt-3">
          <DataState title="Loading summary" message="Checking pending and recent notification delivery." />
        </div>
      </Card>
    );
  }

  const hasFailures = summary.recentFailureCategories.length > 0;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy-900">Notification delivery</h2>
      <p className="mt-1 text-sm text-gray-600">
        Operational counts for guardian pickup and drop-off email notifications in the last 24 hours.
        No personal or message details are shown.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat label="Pending" value={summary.pendingCount} tone={summary.pendingCount > 0 ? 'warning' : 'neutral'} />
        <SummaryStat label="Processing" value={summary.processingCount} tone={summary.processingCount > 0 ? 'info' : 'neutral'} />
        <SummaryStat label="Delivered (24h)" value={summary.deliveredCountRecent} tone="success" />
        <SummaryStat label="Failed (24h)" value={summary.failedCountRecent} tone={summary.failedCountRecent > 0 ? 'danger' : 'neutral'} />
        <SummaryStat label="Cancelled" value={summary.cancelledCountRecent} tone="neutral" />
        <SummaryStat label="Oldest pending" value={formatOldestPendingAge(summary.oldestPendingAgeSeconds)} tone="neutral" />
      </dl>
      {hasFailures && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-gray-700">Recent failure categories</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.recentFailureCategories.map((entry) => (
              <li
                key={entry.category}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
              >
                {formatNotificationFailureCategory(entry.category)}: {entry.count}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!hasFailures && summary.failedCountRecent === 0 && summary.cancelledCountRecent === 0 && (
        <p className="mt-4 text-sm text-gray-500">No recent delivery failures.</p>
      )}
    </Card>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number | string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const toneClasses: Record<string, string> = {
    success: 'text-green-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
    info: 'text-blue-700',
    neutral: 'text-gray-900',
  };
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-1 text-lg font-bold sm:text-2xl ${toneClasses[tone]}`}>{value}</dd>
    </div>
  );
}