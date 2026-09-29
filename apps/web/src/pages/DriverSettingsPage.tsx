import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ClipboardList } from 'lucide-react';
import { Link } from 'react-router';
import type { DriverDeliveryPreferences, PushPermissionState } from '@safebus/types';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import {
  NotificationDeliverySettings,
  type NotificationAlertChoice,
} from '@/components/settings/NotificationDeliverySettings';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  fetchDriverDeliveryPreferences,
  saveDriverDeliveryPreferences,
} from '@/services/notificationService';
import '@/types/nativePush';

type DriverMutation = (value: DriverDeliveryPreferences) => DriverDeliveryPreferences;
type DriverJob = { mutation: DriverMutation; pushMasterValue?: boolean };

export function DriverSettingsPage() {
  const locationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const nativeAndroid = typeof window !== 'undefined' && Boolean(window.SafeBusNativeTracking);
  const nativePushAvailable = window.SafeBusNativePush?.available === true;
  const [preferences, setPreferences] = useState<DriverDeliveryPreferences | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const persistedRef = useRef<DriverDeliveryPreferences | null>(null);
  const jobsRef = useRef<DriverJob[]>([]);
  const processingRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const value = await fetchDriverDeliveryPreferences();
      persistedRef.current = value;
      setPreferences(value);
      if (nativePushAvailable) {
        setPermissionState(await window.SafeBusNativePush!.getPermissionState());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Settings are unavailable.');
    }
  }, [nativePushAvailable]);

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
        persistedRef.current = await saveDriverDeliveryPreferences(next);
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

  function queueChange(mutation: DriverMutation, pushMasterValue?: boolean) {
    if (!preferences) return;
    jobsRef.current.push({ mutation, pushMasterValue });
    setPreferences(mutation(preferences));
    setPendingSaves(jobsRef.current.length + (processingRef.current ? 1 : 0));
    setMessage(null);
    void processJobs();
  }

  const alerts: NotificationAlertChoice[] = preferences
    ? [
        {
          key: 'assignment-alerts',
          label: 'Assignment alerts',
          description: 'When one of your assignments is created, changed, or ended',
          icon: <ClipboardList className="h-5 w-5" aria-hidden />,
          pushChecked: preferences.assignmentAlerts.push,
          emailChecked: preferences.assignmentAlerts.email,
          onPushChange: (checked) =>
            queueChange((value) => ({
              ...value,
              assignmentAlerts: { ...value.assignmentAlerts, push: checked },
            })),
          onEmailChange: (checked) =>
            queueChange((value) => ({
              ...value,
              assignmentAlerts: { ...value.assignmentAlerts, email: checked },
            })),
        },
      ]
    : [];

  return (
    <DashboardLayout title="Driver settings" portal="driver" navItems={[]} navGroups={driverNavGroups}>
      <div className="mx-auto max-w-3xl space-y-5" data-ui="driver-settings-page">
        <PageHeader
          eyebrow="Settings"
          title="Driver settings"
          description="Manage assignment alerts and how this device shares the active bus location."
        />

        <section aria-labelledby="driver-notification-settings" className="space-y-3">
          <div>
            <h2 id="driver-notification-settings" className="text-lg font-bold text-navy-900">
              Notification settings
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              BusSafe only sends you alerts about assignments connected to your driver account.
            </p>
          </div>
          {error ? (
            <div className="space-y-3">
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
          <Link to="/notifications" className="block">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              leftIcon={<Bell className="h-4 w-4" aria-hidden />}
            >
              View notifications
            </Button>
          </Link>
        </section>

        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-900">Location access</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                BusSafe requests location access only for bus trips that you start and stops
                collecting after you end or cancel the trip.
              </p>
            </div>
            <StatusPill tone={locationSupported ? 'success' : 'warning'}>
              {locationSupported ? 'supported' : 'not supported'}
            </StatusPill>
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-navy-900">Before starting a trip</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {nativeAndroid
                ? 'Turn on location services, allow precise location all the time, and allow notifications. Set this up while parked; BusSafe can then continue the active trip when the screen is locked.'
                : 'Turn on device location services and allow location access when your browser asks. Keep this page open during the trip so updates can continue.'}
            </p>
          </div>
        </Card>

        {nativeAndroid ? (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Using your personal phone</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              The same BusSafe Android app serves drivers and guardians. Your signed-in role decides
              which screens you can use. Driver tracking does not require company ownership or
              mobile-device management.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              During an active trip, BusSafe stores queued bus-location fixes and its device
              credential in encrypted app storage. It does not access your contacts, photos,
              microphone, messages, or location from other apps. A persistent Android notification
              shows while collection or required offline recovery is active.
            </p>
          </Card>
        ) : null}

        <Card className="border-warning-200 bg-warning-50 p-5">
          <h2 className="font-bold text-navy-900">Driver safety</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            Set up location access while parked. Do not operate this screen while the bus is moving.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
