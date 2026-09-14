import { useEffect, useState } from 'react';
import { Bell, ExternalLink, LockKeyhole, Mail } from 'lucide-react';
import { Link } from 'react-router';
import type { AndroidPushDevice, NotificationPreferences } from '@safebus/types';
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
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchNotificationPreferences,
  listOwnPushDevices,
  revokeOwnPushDevice,
  saveNotificationPreferences,
} from '@/services/notificationService';
import '@/types/nativePush';

const pushCategories = [
  {
    key: 'pickup_dropoff',
    title: 'Pickup and drop-off',
    description: 'Boarding and drop-off updates for linked students.',
  },
  {
    key: 'trip_status',
    title: 'School run status',
    description: 'When a run starts, pauses, ends, or is cancelled.',
  },
  {
    key: 'service_changes',
    title: 'Service changes',
    description: 'Delays, missing service, road closures, and bus changes.',
  },
  {
    key: 'assignments',
    title: 'Assignment changes',
    description: 'Updates to an assigned bus or service.',
  },
  {
    key: 'operations',
    title: 'Operational updates',
    description: 'Important transportation notices.',
  },
] as const;

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const appSurface = useAppSurface();
  const isNativeMobile = appSurface === 'native-mobile';
  const [value, setValue] = useState<NotificationPreferences | null>(null);
  const [devices, setDevices] = useState<AndroidPushDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = Boolean(
    profile?.role &&
      ['tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'].includes(
        profile.role,
      ),
  );
  const nativePushAvailable = window.SafeBusNativePush?.available === true;

  useEffect(() => {
    const shouldLoadDevices = !isAdmin && !isNativeMobile;
    void Promise.all([
      fetchNotificationPreferences(),
      shouldLoadDevices ? listOwnPushDevices() : Promise.resolve([]),
    ])
      .then(([preferences, registeredDevices]) => {
        setValue(preferences);
        setDevices(registeredDevices);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Settings are unavailable.'),
      );
  }, [isAdmin, isNativeMobile]);

  const portal = isAdmin ? 'admin' : profile?.role === 'driver' ? 'driver' : 'parent';
  const nav =
    profile?.role === 'platform_super_admin'
      ? platformNavGroups
      : isAdmin
        ? adminNavGroups
        : profile?.role === 'driver'
          ? driverNavGroups
          : guardianNavGroups;

  if (error) {
    return (
      <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}>
        <DataState title="Settings unavailable" message={error} />
      </DashboardLayout>
    );
  }

  if (!value) {
    return (
      <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}>
        <DataState title="Loading settings" message="Checking your notification choices." />
      </DashboardLayout>
    );
  }

  const update = (changes: Partial<NotificationPreferences>) =>
    setValue((current) => (current ? { ...current, ...changes } : current));

  async function save() {
    if (!value) return;
    setSaving(true);
    setMessage(null);
    try {
      let next = value;
      if (next.pushEnabled && nativePushAvailable) {
        const permission = await window.SafeBusNativePush!.enable();
        if (permission !== 'granted') next = { ...next, pushEnabled: false };
      } else if (!next.pushEnabled && nativePushAvailable) {
        await window.SafeBusNativePush!.deactivate();
      }
      setValue(await saveNotificationPreferences(next));
      setMessage('Notification settings saved.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}>
      <div data-ui="role-page">
        <PageHeader
          title="Notification settings"
          description={
            isNativeMobile
              ? 'Choose the updates you want to receive on this phone.'
              : 'In-app notifications always remain in your authorized inbox. These choices control Android push only.'
          }
        />

        <form
          className="space-y-4"
          data-ui="notification-preferences-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Card className="p-5" data-ui="notification-delivery-card">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
                <Bell className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-navy-900">Push notifications</h2>
                {isAdmin ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Administrators receive notifications in the web inbox.
                  </p>
                ) : (
                  <label className="mt-3 flex items-start gap-3" data-ui="notification-switch-row">
                    <input
                      type="checkbox"
                      checked={value.pushEnabled}
                      disabled={!nativePushAvailable}
                      onChange={(event) => update({ pushEnabled: event.target.checked })}
                    />
                    <span>
                      <b>Allow notifications on this phone</b>
                      <span className="mt-1 block text-sm leading-5 text-slate-600">
                        {nativePushAvailable
                          ? 'Android will ask for permission when you enable and save this choice.'
                          : 'Push is unavailable in this browser or app build. Your in-app alerts remain available.'}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>
            {nativePushAvailable && !isAdmin ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-4 w-full"
                rightIcon={<ExternalLink className="h-4 w-4" aria-hidden />}
                onClick={() => void window.SafeBusNativePush?.openSystemSettings()}
              >
                Android notification controls
              </Button>
            ) : null}
          </Card>

          {!isAdmin ? (
            <Card className="p-5" data-ui="notification-categories-card">
              <h2 className="font-bold text-navy-900">Alert types</h2>
              <p className="mt-1 text-sm text-slate-600">Turn off anything you do not need.</p>
              <fieldset className="mt-4 divide-y divide-slate-200">
                <legend className="sr-only">Push notification categories</legend>
                {pushCategories.map((category) => (
                  <label
                    key={category.key}
                    className="flex min-h-16 items-start gap-3 py-3 first:pt-0 last:pb-0"
                    data-ui="notification-switch-row"
                  >
                    <input
                      type="checkbox"
                      checked={value.categories[category.key] ?? false}
                      onChange={(event) =>
                        update({
                          categories: {
                            ...value.categories,
                            [category.key]: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      <b className="text-navy-900">{category.title}</b>
                      <span className="mt-0.5 block text-sm leading-5 text-slate-600">
                        {category.description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </Card>
          ) : null}

          <Card className="p-5" data-ui="notification-preview-card">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-bold text-navy-900">Lock-screen privacy</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Previews never include names, routes, stops, coordinates, drivers, or internal IDs.
                </p>
              </div>
            </div>
            <fieldset className="mt-4 grid gap-3">
              <legend className="sr-only">Lock-screen notification preview</legend>
              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 p-3">
                <input
                  type="radio"
                  name="preview"
                  checked={value.previewMode === 'generic'}
                  onChange={() => update({ previewMode: 'generic' })}
                />
                <span>
                  <b className="block text-navy-900">Generic preview</b>
                  <span className="text-sm text-slate-600">Private notification wording</span>
                </span>
              </label>
              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 p-3">
                <input
                  type="radio"
                  name="preview"
                  checked={value.previewMode === 'limited'}
                  onChange={() => update({ previewMode: 'limited' })}
                />
                <span>
                  <b className="block text-navy-900">Event type only</b>
                  <span className="text-sm text-slate-600">Shows the alert category only</span>
                </span>
              </label>
            </fieldset>
          </Card>

          {!isNativeMobile ? (
            <Card className="space-y-4 p-5" data-ui="quiet-hours-settings">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={value.quietHoursEnabled}
                  onChange={(event) => update({ quietHoursEnabled: event.target.checked })}
                />
                Quiet hours
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Start
                  <input
                    type="time"
                    value={value.quietHoursStart}
                    onChange={(event) => update({ quietHoursStart: event.target.value })}
                    className="mt-1 block w-full rounded-lg border p-2"
                  />
                </label>
                <label className="text-sm font-medium">
                  End
                  <input
                    type="time"
                    value={value.quietHoursEnd}
                    onChange={(event) => update({ quietHoursEnd: event.target.value })}
                    className="mt-1 block w-full rounded-lg border p-2"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Timezone override
                <input
                  value={value.timezoneOverride ?? ''}
                  placeholder={value.timezone}
                  onChange={(event) => update({ timezoneOverride: event.target.value || null })}
                  className="mt-1 block w-full rounded-lg border p-2"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Use an IANA timezone such as America/Edmonton.
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={value.urgentBypassQuietHours}
                  onChange={(event) => update({ urgentBypassQuietHours: event.target.checked })}
                />
                Allow urgent operational alerts during quiet hours
              </label>
            </Card>
          ) : null}

          <Button type="submit" fullWidth disabled={saving}>
            {saving ? 'Saving…' : 'Save notification settings'}
          </Button>
          {message ? (
            <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              {message}
            </p>
          ) : null}
        </form>

        {!isAdmin && !isNativeMobile ? (
          <Card className="mt-5 p-5" data-ui="registered-android-devices">
            <h2 className="font-semibold text-slate-950">Registered Android devices</h2>
            {devices.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No device is registered.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {devices.map((device) => (
                  <li key={device.id} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <b>{device.deviceModel ?? 'Android device'}</b>
                      <span className="block text-xs text-slate-500">
                        {device.status} · last refreshed{' '}
                        {new Date(device.lastSeenAt).toLocaleDateString()}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void revokeOwnPushDevice(device.id).then(() =>
                          setDevices((all) => all.filter((item) => item.id !== device.id)),
                        )
                      }
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {profile?.role === 'guardian' ? (
          <Card className="mt-5 p-5" data-ui="guardian-email-notifications">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
                <Mail className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-bold text-navy-900">Pickup and drop-off email</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Email delivery is separately optional for each linked student.
                </p>
                <Link
                  className="mt-3 inline-flex min-h-12 items-center font-bold text-blue-700"
                  to="/notifications/settings/email"
                >
                  Manage email choices
                </Link>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
