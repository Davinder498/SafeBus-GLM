import { AppearanceSettingsCard } from '@/components/settings/AppearanceToggle';
import { useCallback, useEffect, useState } from 'react';
import type { AdminInboxPreferences } from '@safebus/types';
import { Link } from 'react-router';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  fetchAdminInboxPreferences,
  saveAdminInboxPreferences,
} from '@/services/notificationService';

export function AdminNotificationSettingsPage() {
  const [preferences, setPreferences] = useState<AdminInboxPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      setPreferences(await fetchAdminInboxPreferences());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load notification preferences.',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(key: keyof AdminInboxPreferences, enabled: boolean) {
    if (!preferences || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      setPreferences(await saveAdminInboxPreferences({ ...preferences, [key]: enabled }));
      setMessage('Saved');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to save notification preferences.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <DashboardLayout
      title="Notification preferences"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Notification preferences"
          action={
            <Link to="/notifications" className={buttonClass({ variant: 'ghost' })}>
              Back to notifications
            </Link>
          }
        />
        <AppearanceSettingsCard />
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
        {!preferences ? (
          error ? (
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          ) : (
            <DataState title="Loading preferences" message="Checking your saved choices." />
          )
        ) : (
          <Card className="px-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-4">
              <h2 className="font-bold text-navy-900">In-app notifications</h2>
              <ToggleSwitch
                label="In-app notifications"
                checked={preferences.inAppEnabled}
                disabled={saving}
                onChange={(checked) => void update('inAppEnabled', checked)}
              />
            </div>
            <div className="divide-y divide-slate-100">
              {(
                [
                  ['tripUpdates', 'Trip updates'],
                  ['operationalAlerts', 'Operational alerts'],
                  ['deliveryHealth', 'Delivery health'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm font-semibold text-navy-900">{label}</span>
                  <ToggleSwitch
                    label={label}
                    checked={preferences[key]}
                    disabled={saving || !preferences.inAppEnabled}
                    onChange={(checked) => void update(key, checked)}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}
        <p className="min-h-5 text-sm text-slate-600" role="status">
          {saving ? 'Saving…' : message}
        </p>
      </div>
    </DashboardLayout>
  );
}
