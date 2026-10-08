import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { TenantNotificationSettings } from '@safebus/types';
import { Bell, Inbox, Mail, Power, ShieldCheck, Smartphone } from 'lucide-react';
import { NotificationDeliverySummaryCard } from '@/components/admin/NotificationDeliverySummaryCard';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchTenantNotificationSettings,
  setTenantNotificationDeliveryEnabled,
  setTenantPushNotificationsEnabled,
} from '@/services/tenantNotificationSettingsService';
import { cn } from '@/utils/cn';

type PendingChange = { kind: 'delivery' | 'push'; enabled: boolean } | null;

interface PolicyPresentation {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  title: string;
  message: string;
}

function policyPresentation(settings: TenantNotificationSettings): PolicyPresentation {
  if (
    settings.privacyReviewStatus === 'pending' ||
    (settings.privacyReviewStatus === 'approved' && !settings.privacyApprovedAt)
  ) {
    return {
      label: 'Awaiting privacy approval',
      tone: 'warning',
      title: 'External delivery is locked',
      message:
        'Email and Android push remain off until the SafeBus privacy review is approved. The in-app inbox remains available.',
    };
  }
  if (settings.privacyReviewStatus === 'rejected') {
    return {
      label: 'Privacy approval rejected',
      tone: 'danger',
      title: 'External delivery is unavailable',
      message:
        'The privacy review must be resolved by the SafeBus platform team before email or Android push can be enabled.',
    };
  }
  if (!settings.notificationsEnabled) {
    return {
      label: 'Paused',
      tone: 'neutral',
      title: 'External delivery is paused',
      message:
        'Email and Android push are paused for this tenant. Existing individual preferences are preserved.',
    };
  }
  return {
    label: 'Active',
    tone: 'success',
    title: 'External delivery is active',
    message:
      'Approved email delivery is active. Android push follows the tenant channel state and each person’s preferences.',
  };
}

function formatDate(value: string | null): string {
  if (!value) return 'Not approved';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function ChannelCard({
  icon,
  title,
  description,
  active,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  active: boolean;
  action?: ReactNode;
}) {
  return (
    <Card
      className="p-5"
      data-card-type={`tenant-notification-${title.toLowerCase().replaceAll(' ', '-')}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
              active ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-slate-500',
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-navy-900">{title}</h3>
              <StatusPill tone={active ? 'success' : 'neutral'} dot>
                {active ? 'Active' : 'Inactive'}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          </div>
        </div>
      </div>
      {action ? <div className="mt-4 border-t border-slate-100 pt-4">{action}</div> : null}
    </Card>
  );
}

export function AdminNotificationSettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<TenantNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchTenantNotificationSettings());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load tenant notification settings.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmChange() {
    if (!pendingChange) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next =
        pendingChange.kind === 'delivery'
          ? await setTenantNotificationDeliveryEnabled(pendingChange.enabled)
          : await setTenantPushNotificationsEnabled(pendingChange.enabled);
      setSettings(next);
      setMessage(
        pendingChange.kind === 'delivery'
          ? `External delivery ${pendingChange.enabled ? 'resumed' : 'paused'}.`
          : `Android push ${pendingChange.enabled ? 'enabled' : 'disabled'}.`,
      );
      setPendingChange(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The notification setting was not saved.');
      setPendingChange(null);
    } finally {
      setSaving(false);
    }
  }

  const presentation = settings ? policyPresentation(settings) : null;
  const approved =
    settings?.privacyReviewStatus === 'approved' && Boolean(settings.privacyApprovedAt);
  const dialogTitle = pendingChange
    ? pendingChange.kind === 'delivery'
      ? pendingChange.enabled
        ? 'Resume external delivery?'
        : 'Pause external delivery?'
      : pendingChange.enabled
        ? 'Enable Android push?'
        : 'Disable Android push?'
    : '';
  const dialogDescription = pendingChange
    ? pendingChange.kind === 'delivery'
      ? pendingChange.enabled
        ? 'Email and any enabled Android push delivery will resume for people who have chosen those notifications.'
        : 'New email and Android push deliveries will stop for this tenant. The in-app inbox and individual preferences will remain available.'
      : pendingChange.enabled
        ? 'Android push will become available to people who have enabled it in their personal settings.'
        : 'Android push will stop for this tenant. Email and the in-app inbox will continue according to their current settings.'
    : '';

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6" data-ui="tenant-notification-settings-page">
        <PageHeader
          eyebrow="Settings"
          title="Notifications"
          description="Control tenant-wide email and Android push delivery and monitor delivery health. Individual preferences remain with each guardian and driver."
          icon={<Bell className="h-6 w-6" aria-hidden />}
        />

        <AdminSettingsNav role={profile?.role} />

        {error ? (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-danger-700">{error}</p>
              {!settings ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        {message ? (
          <p
            className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-semibold text-success-700"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        {loading ? (
          <DataState
            title="Loading notification controls"
            message="Checking tenant delivery and privacy status."
          />
        ) : settings && presentation ? (
          <>
            <Card
              className={cn(
                'p-5',
                presentation.tone === 'success' && 'border-success-200 bg-success-50/50',
                presentation.tone === 'warning' && 'border-warning-200 bg-warning-50/50',
                presentation.tone === 'danger' && 'border-danger-200 bg-danger-50/50',
              )}
              data-card-type="tenant-notification-policy"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-navy-700 shadow-sm ring-1 ring-slate-200">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-navy-900">{presentation.title}</h2>
                      <StatusPill tone={presentation.tone} dot>
                        {presentation.label}
                      </StatusPill>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      {presentation.message}
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Privacy approval: {formatDate(settings.privacyApprovedAt)}
                    </p>
                  </div>
                </div>
                {approved ? (
                  <Button
                    type="button"
                    variant={settings.notificationsEnabled ? 'danger' : 'primary'}
                    leftIcon={<Power className="h-4 w-4" aria-hidden />}
                    onClick={() =>
                      setPendingChange({
                        kind: 'delivery',
                        enabled: !settings.notificationsEnabled,
                      })
                    }
                  >
                    {settings.notificationsEnabled ? 'Pause delivery' : 'Resume delivery'}
                  </Button>
                ) : null}
              </div>
            </Card>

            <section aria-labelledby="notification-channels-heading">
              <div className="mb-3">
                <h2 id="notification-channels-heading" className="text-xl font-bold text-navy-900">
                  Delivery channels
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Tenant controls set availability. Each person still chooses their own optional
                  alerts.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ChannelCard
                  title="In-app inbox"
                  active
                  icon={<Inbox className="h-5 w-5" aria-hidden />}
                  description="Always available as the authoritative notification record."
                />
                <ChannelCard
                  title="Email"
                  active={settings.emailEffective}
                  icon={<Mail className="h-5 w-5" aria-hidden />}
                  description="Follows the approved external-delivery state and each person’s email choices."
                />
                <ChannelCard
                  title="Android push"
                  active={settings.pushEffective}
                  icon={<Smartphone className="h-5 w-5" aria-hidden />}
                  description="Requires active external delivery and each person’s device permission."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!approved || !settings.notificationsEnabled}
                      onClick={() =>
                        setPendingChange({
                          kind: 'push',
                          enabled: !settings.pushNotificationsEnabled,
                        })
                      }
                    >
                      {settings.pushNotificationsEnabled ? 'Disable push' : 'Enable push'}
                    </Button>
                  }
                />
              </div>
            </section>
          </>
        ) : null}

        <NotificationDeliverySummaryCard />

        <ConfirmDialog
          open={pendingChange !== null}
          title={dialogTitle}
          description={dialogDescription}
          confirmLabel={
            pendingChange?.kind === 'delivery'
              ? pendingChange.enabled
                ? 'Resume delivery'
                : 'Pause delivery'
              : pendingChange?.enabled
                ? 'Enable push'
                : 'Disable push'
          }
          destructive={pendingChange?.kind === 'delivery' && !pendingChange.enabled}
          busy={saving}
          onConfirm={() => void confirmChange()}
          onCancel={() => setPendingChange(null)}
        />
      </div>
    </DashboardLayout>
  );
}
