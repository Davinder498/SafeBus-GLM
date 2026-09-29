import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BusFront, ExternalLink, Mail, Route, TriangleAlert } from 'lucide-react';
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

type GuardianMutation = (value: GuardianDeliveryPreferences) => GuardianDeliveryPreferences;
type GuardianJob = { mutation: GuardianMutation; pushMasterValue?: boolean };

interface ChannelCardProps {
  checked: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}

function ChannelCard({ checked, description, icon, label, onChange }: ChannelCardProps) {
  return (
    <Card className="p-0" data-card-type={`notification-${label.toLowerCase()}`}>
      <label
        className="grid min-h-24 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4"
        data-ui="notification-channel-control"
      >
        <GuardianIconTile>{icon}</GuardianIconTile>
        <span className="min-w-0">
          <b className="block text-navy-900">{label}</b>
          <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    </Card>
  );
}

interface AlertRowProps {
  description: string;
  emailChecked: boolean;
  icon: React.ReactNode;
  label: string;
  onEmailChange: (checked: boolean) => void;
  onPushChange: (checked: boolean) => void;
  pushChecked: boolean;
}

function AlertRow({
  description,
  emailChecked,
  icon,
  label,
  onEmailChange,
  onPushChange,
  pushChecked,
}: AlertRowProps) {
  return (
    <div
      className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 px-4 py-3"
      data-ui="notification-alert-row"
    >
      <GuardianIconTile>{icon}</GuardianIconTile>
      <span className="min-w-0 pr-1">
        <b className="block text-sm text-navy-900">{label}</b>
        <span className="mt-0.5 block text-xs leading-4 text-slate-600">{description}</span>
      </span>
      <label
        className="grid min-h-12 min-w-12 cursor-pointer place-items-center"
        data-ui="notification-alert-channel-control"
      >
        <span className="sr-only">{label} push</span>
        <input
          type="checkbox"
          checked={pushChecked}
          aria-label={`${label} push`}
          onChange={(event) => onPushChange(event.target.checked)}
        />
      </label>
      <label
        className="grid min-h-12 min-w-12 cursor-pointer place-items-center"
        data-ui="notification-alert-channel-control"
      >
        <span className="sr-only">{label} email</span>
        <input
          type="checkbox"
          checked={emailChecked}
          aria-label={`${label} email`}
          onChange={(event) => onEmailChange(event.target.checked)}
        />
      </label>
    </div>
  );
}

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const isGuardian = profile?.role === 'guardian';
  const isDriver = profile?.role === 'driver';
  const isAdmin = Boolean(
    profile?.role &&
    ['tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'].includes(
      profile.role,
    ),
  );
  const [preferences, setPreferences] = useState<GuardianDeliveryPreferences | null>(null);
  const [legacyPreferences, setLegacyPreferences] = useState<NotificationPreferences | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const persistedRef = useRef<GuardianDeliveryPreferences | null>(null);
  const jobsRef = useRef<GuardianJob[]>([]);
  const processingRef = useRef(false);
  const nativePushAvailable = window.SafeBusNativePush?.available === true;

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isGuardian) {
        const value = await fetchGuardianDeliveryPreferences();
        persistedRef.current = value;
        setPreferences(value);
      } else if (isDriver) {
        const value = await fetchNotificationPreferences();
        setLegacyPreferences(value);
        setPreferences({
          pushEnabled: value.pushEnabled,
          emailEnabled: false,
          pickupDropoff: { push: false, email: false },
          tripUpdates: { push: false, email: false },
          operationalAlerts: { push: false, email: false },
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

  const projectPendingJobs = useCallback(() => {
    if (!persistedRef.current) return;
    setPreferences(
      jobsRef.current.reduce((value, job) => job.mutation(value), persistedRef.current),
    );
  }, []);

  const processGuardianJobs = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    while (jobsRef.current.length > 0 && persistedRef.current) {
      const job = jobsRef.current.shift()!;
      const previous = persistedRef.current;
      const next = job.mutation(previous);
      let nativePushChanged = false;
      try {
        if (job.pushMasterValue !== undefined && nativePushAvailable) {
          if (job.pushMasterValue) {
            const permission = await window.SafeBusNativePush!.enable();
            setPermissionState(permission);
            if (permission !== 'granted') {
              throw new Error('Push permission is turned off in Android settings.');
            }
          } else {
            await window.SafeBusNativePush!.deactivate();
            setPermissionState(await window.SafeBusNativePush!.getPermissionState());
          }
          nativePushChanged = true;
        }
        persistedRef.current = await saveGuardianDeliveryPreferences(next);
        setMessage('Saved');
      } catch (reason) {
        if (nativePushChanged) {
          if (previous.pushEnabled) {
            await window.SafeBusNativePush!.refresh().catch(() => undefined);
          } else {
            await window.SafeBusNativePush!.deactivate().catch(() => undefined);
          }
        }
        setMessage(reason instanceof Error ? reason.message : 'Could not save this setting.');
      } finally {
        setPendingSaves(jobsRef.current.length);
        projectPendingJobs();
      }
    }
    processingRef.current = false;
  }, [nativePushAvailable, projectPendingJobs]);

  function queueGuardianChange(mutation: GuardianMutation, pushMasterValue?: boolean) {
    if (!preferences) return;
    jobsRef.current.push({ mutation, pushMasterValue });
    setPreferences(mutation(preferences));
    setPendingSaves(jobsRef.current.length + (processingRef.current ? 1 : 0));
    setMessage(null);
    void processGuardianJobs();
  }

  async function updateDriverPush(requestedValue: boolean) {
    if (!preferences || !legacyPreferences || pendingSaves > 0) return;
    const previous = preferences;
    setPreferences({ ...preferences, pushEnabled: requestedValue });
    setPendingSaves(1);
    setMessage(null);
    let nativePushChanged = false;
    try {
      if (nativePushAvailable) {
        if (requestedValue) {
          const permission = await window.SafeBusNativePush!.enable();
          setPermissionState(permission);
          if (permission !== 'granted') {
            throw new Error('Push permission is turned off in Android settings.');
          }
        } else {
          await window.SafeBusNativePush!.deactivate();
        }
        nativePushChanged = true;
      }
      const saved = await saveNotificationPreferences({
        ...legacyPreferences,
        pushEnabled: requestedValue,
      });
      setLegacyPreferences(saved);
      setPreferences({ ...preferences, pushEnabled: saved.pushEnabled });
      setMessage('Saved');
    } catch (reason) {
      if (nativePushChanged && !previous.pushEnabled) {
        await window.SafeBusNativePush!.deactivate().catch(() => undefined);
      }
      setPreferences(previous);
      setMessage(reason instanceof Error ? reason.message : 'Could not save this setting.');
    } finally {
      setPendingSaves(0);
    }
  }

  const portal = isAdmin ? 'admin' : isDriver ? 'driver' : 'parent';
  const nav =
    profile?.role === 'platform_super_admin'
      ? platformNavGroups
      : isAdmin
        ? adminNavGroups
        : isDriver
          ? driverNavGroups
          : guardianNavGroups;

  const updateGroup = (
    group: 'pickupDropoff' | 'tripUpdates' | 'operationalAlerts',
    channel: 'push' | 'email',
    checked: boolean,
  ) =>
    queueGuardianChange((value) => ({
      ...value,
      [group]: { ...value[group], [channel]: checked },
    }));

  return (
    <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}>
      <div className="mx-auto max-w-2xl" data-ui="notification-settings-page">
        <PageHeader
          title="Notification settings"
          description="Choose how BusSafe should reach you."
        />

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
            <div className="grid gap-3 sm:grid-cols-2" data-ui="notification-delivery-cards">
              <ChannelCard
                label="Push notifications"
                description="Alerts on your Android devices."
                checked={preferences.pushEnabled}
                icon={<Bell className="h-5 w-5" aria-hidden />}
                onChange={(checked) =>
                  isGuardian
                    ? queueGuardianChange((value) => ({ ...value, pushEnabled: checked }), checked)
                    : void updateDriverPush(checked)
                }
              />
              {isGuardian ? (
                <ChannelCard
                  label="Email notifications"
                  description="Updates sent to your account email."
                  checked={preferences.emailEnabled}
                  icon={<Mail className="h-5 w-5" aria-hidden />}
                  onChange={(checked) =>
                    queueGuardianChange((value) => ({ ...value, emailEnabled: checked }))
                  }
                />
              ) : null}
            </div>

            {isGuardian ? (
              <Card className="mt-4 overflow-hidden p-0" data-card-type="notification-alert-matrix">
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-end border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 className="font-bold text-navy-900">Alert types</h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Choose each delivery channel independently.
                    </p>
                  </div>
                  <span className="text-center text-xs font-semibold text-slate-600">Push</span>
                  <span className="text-center text-xs font-semibold text-slate-600">Email</span>
                </div>
                <div className="divide-y divide-slate-200">
                  <AlertRow
                    label="Pickup & drop-off"
                    description="Recorded boarding and drop-off events"
                    icon={<BusFront className="h-5 w-5" aria-hidden />}
                    pushChecked={preferences.pickupDropoff.push}
                    emailChecked={preferences.pickupDropoff.email}
                    onPushChange={(checked) => updateGroup('pickupDropoff', 'push', checked)}
                    onEmailChange={(checked) => updateGroup('pickupDropoff', 'email', checked)}
                  />
                  <AlertRow
                    label="Trip updates"
                    description="Trip starts, completions and cancellations"
                    icon={<Route className="h-5 w-5" aria-hidden />}
                    pushChecked={preferences.tripUpdates.push}
                    emailChecked={preferences.tripUpdates.email}
                    onPushChange={(checked) => updateGroup('tripUpdates', 'push', checked)}
                    onEmailChange={(checked) => updateGroup('tripUpdates', 'email', checked)}
                  />
                  <AlertRow
                    label="Operational alerts"
                    description="Delays, disruptions and service changes"
                    icon={<TriangleAlert className="h-5 w-5" aria-hidden />}
                    pushChecked={preferences.operationalAlerts.push}
                    emailChecked={preferences.operationalAlerts.email}
                    onPushChange={(checked) => updateGroup('operationalAlerts', 'push', checked)}
                    onEmailChange={(checked) => updateGroup('operationalAlerts', 'email', checked)}
                  />
                </div>
              </Card>
            ) : null}

            <div className="mt-3 min-h-12" aria-live="polite" aria-atomic="true">
              {pendingSaves > 0 || message ? (
                <p
                  className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700"
                  data-ui="notification-settings-status"
                  role="status"
                >
                  {pendingSaves > 0 ? 'Saving…' : message}
                </p>
              ) : null}
              {nativePushAvailable &&
              (permissionState === 'denied' || permissionState === 'permanently_denied') ? (
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
