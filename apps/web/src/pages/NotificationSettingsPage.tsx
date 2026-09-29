import { useCallback, useEffect, useRef, useState } from 'react';
import { BusFront, Route, TriangleAlert } from 'lucide-react';
import { Navigate } from 'react-router';
import type { GuardianDeliveryPreferences, PushPermissionState } from '@safebus/types';
import {
  DashboardLayout,
  adminNavGroups,
  guardianNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import {
  NotificationDeliverySettings,
  type NotificationAlertChoice,
} from '@/components/settings/NotificationDeliverySettings';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchGuardianDeliveryPreferences,
  saveGuardianDeliveryPreferences,
} from '@/services/notificationService';
import '@/types/nativePush';

type GuardianMutation = (value: GuardianDeliveryPreferences) => GuardianDeliveryPreferences;
type GuardianJob = { mutation: GuardianMutation; pushMasterValue?: boolean };

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const isGuardian = profile?.role === 'guardian';
  const isAdmin = Boolean(
    profile?.role &&
      ['tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'].includes(
        profile.role,
      ),
  );
  const [preferences, setPreferences] = useState<GuardianDeliveryPreferences | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const persistedRef = useRef<GuardianDeliveryPreferences | null>(null);
  const jobsRef = useRef<GuardianJob[]>([]);
  const processingRef = useRef(false);
  const nativePushAvailable = window.SafeBusNativePush?.available === true;

  const load = useCallback(async () => {
    if (!isGuardian) return;
    setError(null);
    try {
      const value = await fetchGuardianDeliveryPreferences();
      persistedRef.current = value;
      setPreferences(value);
      if (nativePushAvailable) {
        setPermissionState(await window.SafeBusNativePush!.getPermissionState());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Settings are unavailable.');
    }
  }, [isGuardian, nativePushAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectPendingJobs = useCallback(() => {
    if (!persistedRef.current) return;
    setPreferences(
      jobsRef.current.reduce((value, job) => job.mutation(value), persistedRef.current),
    );
  }, []);

  const processJobs = useCallback(async () => {
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

  function queueChange(mutation: GuardianMutation, pushMasterValue?: boolean) {
    if (!preferences) return;
    jobsRef.current.push({ mutation, pushMasterValue });
    setPreferences(mutation(preferences));
    setPendingSaves(jobsRef.current.length + (processingRef.current ? 1 : 0));
    setMessage(null);
    void processJobs();
  }

  if (profile?.role === 'driver') {
    return <Navigate to="/driver/settings" replace />;
  }

  const nav =
    profile?.role === 'platform_super_admin'
      ? platformNavGroups
      : isAdmin
        ? adminNavGroups
        : guardianNavGroups;

  const updateGroup = (
    group: 'pickupDropoff' | 'tripUpdates' | 'operationalAlerts',
    channel: 'push' | 'email',
    checked: boolean,
  ) =>
    queueChange((value) => ({
      ...value,
      [group]: { ...value[group], [channel]: checked },
    }));

  const alerts: NotificationAlertChoice[] = preferences
    ? [
        {
          key: 'pickup-dropoff',
          label: 'Pickup & drop-off',
          description: 'Recorded boarding and drop-off events',
          icon: <BusFront className="h-5 w-5" aria-hidden />,
          pushChecked: preferences.pickupDropoff.push,
          emailChecked: preferences.pickupDropoff.email,
          onPushChange: (checked) => updateGroup('pickupDropoff', 'push', checked),
          onEmailChange: (checked) => updateGroup('pickupDropoff', 'email', checked),
        },
        {
          key: 'trip-updates',
          label: 'Trip updates',
          description: 'Trip starts, completions and cancellations',
          icon: <Route className="h-5 w-5" aria-hidden />,
          pushChecked: preferences.tripUpdates.push,
          emailChecked: preferences.tripUpdates.email,
          onPushChange: (checked) => updateGroup('tripUpdates', 'push', checked),
          onEmailChange: (checked) => updateGroup('tripUpdates', 'email', checked),
        },
        {
          key: 'operational-alerts',
          label: 'Operational alerts',
          description: 'Delays, disruptions and service changes',
          icon: <TriangleAlert className="h-5 w-5" aria-hidden />,
          pushChecked: preferences.operationalAlerts.push,
          emailChecked: preferences.operationalAlerts.email,
          onPushChange: (checked) => updateGroup('operationalAlerts', 'push', checked),
          onEmailChange: (checked) => updateGroup('operationalAlerts', 'email', checked),
        },
      ]
    : [];

  return (
    <DashboardLayout
      title="Notification settings"
      portal={isAdmin ? 'admin' : 'parent'}
      navItems={[]}
      navGroups={nav}
    >
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
          <NotificationDeliverySettings
            pushEnabled={preferences.pushEnabled}
            emailEnabled={preferences.emailEnabled}
            alerts={alerts}
            pendingSaves={pendingSaves}
            message={message}
            nativePushAvailable={nativePushAvailable}
            permissionState={permissionState}
            onPushEnabledChange={(checked) =>
              queueChange((value) => ({ ...value, pushEnabled: checked }), checked)
            }
            onEmailEnabledChange={(checked) =>
              queueChange((value) => ({ ...value, emailEnabled: checked }))
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
