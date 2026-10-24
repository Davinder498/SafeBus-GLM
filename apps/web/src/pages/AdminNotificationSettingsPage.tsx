import { useCallback, useEffect, useState } from 'react';
import type { TenantNotificationSettings } from '@safebus/types';
import { Link } from 'react-router';
import { ArrowLeft, Bell } from 'lucide-react';
import { NotificationDeliverySummaryCard } from '@/components/admin/NotificationDeliverySummaryCard';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  fetchTenantNotificationSettings,
  setTenantNotificationDeliveryEnabled,
  setTenantPushNotificationsEnabled,
} from '@/services/tenantNotificationSettingsService';

type PendingChange = { kind: 'delivery' | 'push'; enabled: boolean } | null;

export function AdminNotificationSettingsPage() {
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
        cause instanceof Error
          ? cause.message
          : 'Unable to load school authority notification settings.',
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
          ? `Email and phone alerts ${pendingChange.enabled ? 'resumed' : 'paused'}.`
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

  const approved =
    settings?.privacyReviewStatus === 'approved' && Boolean(settings.privacyApprovedAt);
  const dialogTitle = pendingChange
    ? pendingChange.kind === 'delivery'
      ? pendingChange.enabled
        ? 'Resume email and phone alerts?'
        : 'Pause email and phone alerts?'
      : pendingChange.enabled
        ? 'Enable Android push?'
        : 'Disable Android push?'
    : '';
  const dialogDescription = pendingChange
    ? pendingChange.kind === 'delivery'
      ? pendingChange.enabled
        ? 'Email and any enabled Android push delivery will resume for people who have chosen those notifications.'
        : 'New email and Android push deliveries will stop for this school authority. The in-app inbox and individual preferences will remain available.'
      : pendingChange.enabled
        ? 'Android push will become available to people who have enabled it in their personal settings.'
        : 'Android push will stop for this school authority. Email and the in-app inbox will continue according to their current settings.'
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
          eyebrow="Notifications"
          title="Notification settings"
          description="Manage alerts for your school authority. Guardians and drivers choose their own notification preferences."
          icon={<Bell className="h-6 w-6" aria-hidden />}
          action={
            <Link to="/notifications" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to notifications
            </Link>
          }
        />
        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-danger-700">{error}</p>
              {!settings && (
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              )}
            </div>
          </Card>
        )}
        {message && (
          <p className="text-sm font-medium text-success-700" role="status" aria-live="polite">
            {message}
          </p>
        )}
        {loading ? (
          <DataState
            title="Loading notification settings"
            message="Checking your school authority's saved settings."
          />
        ) : settings ? (
          <Card className="px-5 shadow-none sm:px-6">
            <section aria-labelledby="school-authority-alerts-heading">
              <h2
                id="school-authority-alerts-heading"
                className="pt-5 text-lg font-semibold text-navy-900"
              >
                School authority alerts
              </h2>
              {!approved && (
                <p className="mt-3 text-sm leading-6 text-slate-600" role="status">
                  Email and phone alerts are not available for this school authority yet.{' '}
                  <Link
                    to="/admin/settings/support"
                    className="font-semibold text-navy-700 underline"
                  >
                    Contact SafeBus support
                  </Link>{' '}
                  to finish notification setup.
                </p>
              )}
              <div className="mt-2 divide-y divide-slate-200">
                <div
                  className="flex items-center justify-between gap-4 py-4"
                  data-ui="notification-setting-row"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">Email and phone alerts</h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {!approved ? 'Not available yet' : settings.emailEffective ? 'On' : 'Paused'}
                    </p>
                  </div>
                  <ToggleSwitch
                    label="Email and phone alerts"
                    checked={settings.emailEffective}
                    disabled={!approved || saving}
                    onChange={(enabled) => setPendingChange({ kind: 'delivery', enabled })}
                  />
                </div>
                <div
                  className="flex items-center justify-between gap-4 py-4"
                  data-ui="notification-setting-row"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">Android push</h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {!approved
                        ? 'Not available yet'
                        : !settings.notificationsEnabled
                          ? 'Paused with email and phone alerts; your choice is saved'
                          : settings.pushEffective
                            ? 'On'
                            : 'Off'}
                    </p>
                  </div>
                  <ToggleSwitch
                    label="Android push"
                    checked={settings.pushNotificationsEnabled}
                    disabled={!approved || !settings.notificationsEnabled || saving}
                    onChange={(enabled) => setPendingChange({ kind: 'push', enabled })}
                  />
                </div>
              </div>
            </section>
          </Card>
        ) : null}
        <details>
          <summary className="w-fit cursor-pointer rounded-lg py-3 text-sm font-semibold text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600">
            Delivery activity
          </summary>
          <div className="mt-3">
            <NotificationDeliverySummaryCard />
          </div>
        </details>
        <ConfirmDialog
          open={pendingChange !== null}
          title={dialogTitle}
          description={dialogDescription}
          confirmLabel={
            pendingChange?.kind === 'delivery'
              ? pendingChange.enabled
                ? 'Resume alerts'
                : 'Pause alerts'
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
