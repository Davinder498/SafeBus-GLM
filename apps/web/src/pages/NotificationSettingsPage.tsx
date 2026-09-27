import { useCallback, useEffect, useState } from 'react';
import { Bell, ExternalLink, Mail } from 'lucide-react';
import type {
  GuardianDeliveryPreferences,
  NotificationPreferences,
  PushPermissionState,
} from '@safebus/types';
import {
  DashboardLayout,
  adminNavGroups,
  driverNavGroups,
  guardianNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { GuardianIconTile } from '@/components/ui/GuardianIconTile';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchGuardianDeliveryPreferences,
  fetchNotificationPreferences,
  saveGuardianDeliveryPreferences,
  saveNotificationPreferences,
} from '@/services/notificationService';
import '@/types/nativePush';

type PreferenceKey = keyof GuardianDeliveryPreferences;

interface PreferenceRowProps {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}

function PreferenceRow({
  checked,
  description,
  disabled,
  icon,
  label,
  onChange,
}: PreferenceRowProps) {
  return (
    <label
      className="grid min-h-20 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-5"
      data-ui="guardian-delivery-row"
    >
      <GuardianIconTile>{icon}</GuardianIconTile>
      <span className="min-w-0">
        <b className="block text-navy-900">{label}</b>
        <span className="mt-0.5 block text-sm leading-5 text-slate-600">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const isGuardian = profile?.role === 'guardian';
  const isDriver = profile?.role === 'driver';
  const isAdmin = Boolean(
    profile?.role
    && ['tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'].includes(
      profile.role,
    ),
  );
  const [preferences, setPreferences] = useState<GuardianDeliveryPreferences | null>(null);
  const [legacyPreferences, setLegacyPreferences] = useState<NotificationPreferences | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nativePushAvailable = window.SafeBusNativePush?.available === true;

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isGuardian) {
        setPreferences(await fetchGuardianDeliveryPreferences());
      } else if (isDriver) {
        const value = await fetchNotificationPreferences();
        setLegacyPreferences(value);
        setPreferences({
          pushEnabled: value.pushEnabled,
          emailPickupDropoffEnabled: false,
        });
      }
      if (nativePushAvailable) {
        setPermissionState(await window.SafeBusNativePush!.getPermissionState());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Settings are unavailable.');
    }
  }, [isDriver, isGuardian, nativePushAvailable]);

  useEffect(() => {
    if (!isAdmin) void load();
  }, [isAdmin, load]);

  const portal = isAdmin ? 'admin' : isDriver ? 'driver' : 'parent';
  const nav =
    profile?.role === 'platform_super_admin'
      ? platformNavGroups
      : isAdmin
        ? adminNavGroups
        : isDriver
          ? driverNavGroups
          : guardianNavGroups;

  async function updatePreference(key: PreferenceKey, requestedValue: boolean) {
    if (!preferences || savingKey) return;
    const previous = preferences;
    let next = { ...preferences, [key]: requestedValue };
    setPreferences(next);
    setSavingKey(key);
    setMessage(null);
    let nativePushChanged = false;

    try {
      if (key === 'pushEnabled' && nativePushAvailable) {
        if (requestedValue) {
          const permission = await window.SafeBusNativePush!.enable();
          setPermissionState(permission);
          if (permission !== 'granted') {
            next = { ...next, pushEnabled: false };
            setPreferences(next);
            throw new Error('Push permission is turned off in Android settings.');
          }
          nativePushChanged = true;
        } else {
          await window.SafeBusNativePush!.deactivate();
          nativePushChanged = true;
          setPermissionState(await window.SafeBusNativePush!.getPermissionState());
        }
      }

      if (isGuardian) {
        setPreferences(await saveGuardianDeliveryPreferences(next));
      } else if (isDriver && legacyPreferences) {
        const saved = await saveNotificationPreferences({
          ...legacyPreferences,
          pushEnabled: next.pushEnabled,
        });
        setLegacyPreferences(saved);
        setPreferences({ ...next, pushEnabled: saved.pushEnabled });
      }
      setMessage('Saved');
    } catch (reason) {
      if (key === 'pushEnabled' && nativePushAvailable && nativePushChanged) {
        if (previous.pushEnabled) {
          await window.SafeBusNativePush!.refresh().catch(() => undefined);
        } else {
          await window.SafeBusNativePush!.deactivate().catch(() => undefined);
        }
      }
      setPreferences(previous);
      setMessage(reason instanceof Error ? reason.message : 'Could not save this setting.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}>
      <div className="mx-auto max-w-2xl" data-ui="notification-settings-page">
        <PageHeader title="Notification settings" description="Choose how BusSafe should reach you." />

        {isAdmin ? (
          <DataState
            title="No settings needed"
            message="Administrative updates remain available in your notification inbox."
          />
        ) : error ? (
          <div className="space-y-4">
            <DataState title="Settings unavailable" message={error} />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !preferences ? (
          <DataState title="Loading settings" message="Checking your notification choices." />
        ) : (
          <>
            <Card
              className="divide-y divide-slate-200 overflow-hidden p-0"
              data-ui="guardian-delivery-settings-card"
            >
              <PreferenceRow
                label="Push notifications"
                description="Trip and service updates on your Android devices."
                checked={preferences.pushEnabled}
                disabled={savingKey !== null}
                icon={<Bell className="h-5 w-5" aria-hidden />}
                onChange={(checked) => void updatePreference('pushEnabled', checked)}
              />
              {isGuardian ? (
                <PreferenceRow
                  label="Pickup and drop-off emails"
                  description="Email both pickup and drop-off updates for all linked students."
                  checked={preferences.emailPickupDropoffEnabled}
                  disabled={savingKey !== null}
                  icon={<Mail className="h-5 w-5" aria-hidden />}
                  onChange={(checked) =>
                    void updatePreference('emailPickupDropoffEnabled', checked)
                  }
                />
              ) : null}
            </Card>

            <div className="mt-3 min-h-12" aria-live="polite">
              {savingKey || message ? (
                <p
                  className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700"
                  data-ui="notification-settings-status"
                  role="status"
                >
                  {savingKey ? 'Saving…' : message}
                </p>
              ) : null}
              {nativePushAvailable
              && (permissionState === 'denied' || permissionState === 'permanently_denied') ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full"
                  rightIcon={<ExternalLink className="h-4 w-4" aria-hidden />}
                  onClick={() => void window.SafeBusNativePush?.openSystemSettings()}
                >
                  Open Android notification settings
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
