import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  fetchGuardianNotificationPreferences,
  saveGuardianNotificationPreference,
} from '@/services/guardianNotificationPreferenceService';
import type { GuardianNotificationPreference } from '@/types/guardianNotificationPreference';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; preferences: GuardianNotificationPreference[] };

function PreferenceCard({ preference }: { preference: GuardianNotificationPreference }) {
  const [emailEnabled, setEmailEnabled] = useState(preference.emailEnabled);
  const [notifyPickup, setNotifyPickup] = useState(preference.notifyPickup);
  const [notifyDropoff, setNotifyDropoff] = useState(preference.notifyDropoff);
  const [pushPickupDropoff, setPushPickupDropoff] = useState(preference.pushPickupDropoff);
  const [pushTripStatus, setPushTripStatus] = useState(preference.pushTripStatus);
  const [pushServiceChanges, setPushServiceChanges] = useState(preference.pushServiceChanges);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function save() {
    setSaving(true);
    setMessage(null);
    setIsError(false);
    try {
      await saveGuardianNotificationPreference({
        studentId: preference.studentId,
        emailEnabled,
        notifyPickup,
        notifyDropoff,
        pushPickupDropoff,
        pushTripStatus,
        pushServiceChanges,
      });
      setMessage(
        emailEnabled
          ? 'Your email choices are saved.'
          : 'Email notifications are turned off for this student.',
      );
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'We could not save your choices.');
    } finally {
      setSaving(false);
    }
  }

  const describedBy = `notification-help-${preference.studentId}`;
  return (
    <Card className="p-5" data-testid="guardian-notification-preference-card">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="space-y-4" disabled={saving} aria-describedby={describedBy}>
          <legend className="text-xl font-bold text-navy-900">{preference.studentName}</legend>
          <p id={describedBy} className="text-sm leading-6 text-gray-600">
            Choose whether SafeBus may email you after a pickup or drop-off event is recorded. These
            messages are not live child tracking and do not confirm safety or custody.
          </p>

          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-gray-300 text-navy-700 focus:ring-navy-500"
              checked={emailEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                setEmailEnabled(enabled);
                if (!enabled) {
                  setNotifyPickup(false);
                  setNotifyDropoff(false);
                }
              }}
            />
            <span>
              <span className="block font-semibold text-navy-900">Email me trip events</span>
              <span className="block text-sm text-gray-600">
                Turning this off unsubscribes you from both event emails for this student.
              </span>
            </span>
          </label>

          <div className="ml-0 space-y-2 sm:ml-8">
            <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-navy-700 focus:ring-navy-500"
                checked={notifyPickup}
                disabled={!emailEnabled || saving}
                onChange={(event) => setNotifyPickup(event.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">Email me after pickup</span>
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-navy-700 focus:ring-navy-500"
                checked={notifyDropoff}
                disabled={!emailEnabled || saving}
                onChange={(event) => setNotifyDropoff(event.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">Email me after drop-off</span>
            </label>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="font-semibold text-navy-900">Android push for this linked student</h3>
            <p className="mt-1 text-sm text-gray-600">These choices apply only after Android push is enabled in the main notification settings.</p>
            <div className="mt-2 space-y-2">
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2"><input type="checkbox" className="h-5 w-5" checked={pushPickupDropoff} onChange={(event)=>setPushPickupDropoff(event.target.checked)}/><span className="text-sm font-medium">Pickup and drop-off updates</span></label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2"><input type="checkbox" className="h-5 w-5" checked={pushTripStatus} onChange={(event)=>setPushTripStatus(event.target.checked)}/><span className="text-sm font-medium">Trip status and disruptions</span></label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2"><input type="checkbox" className="h-5 w-5" checked={pushServiceChanges} onChange={(event)=>setPushServiceChanges(event.target.checked)}/><span className="text-sm font-medium">Bus-service changes</span></label>
            </div>
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving}>Save choices</Button>
          {message && (
            <p
              role={isError ? 'alert' : 'status'}
              aria-live="polite"
              className={`text-sm font-semibold ${isError ? 'text-danger-700' : 'text-success-700'}`}
            >
              {message}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

export function GuardianNotificationPreferencesPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', preferences: await fetchGuardianNotificationPreferences() });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Parent Dashboard" portal="parent" navItems={[]} navGroups={guardianNavGroups}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Notifications"
          title="Guardian notification choices"
          description="Choose pickup/drop-off email and Android push categories separately for each linked student. New choices start off until you save them."
        />

        <Card className="border-navy-100 bg-navy-50 p-4">
          <p className="text-sm leading-6 text-navy-900">
            Your choices take effect immediately. Delivery also depends on your transportation
            organization completing its privacy review and enabling notifications.
          </p>
        </Card>

        {state.kind === 'loading' && (
          <DataState title="Loading notification choices" message="Checking your linked students." />
        )}
        {state.kind === 'error' && (
          <div className="space-y-4">
            <DataState title="We could not load your notification choices." message="Please try again." />
            <Button type="button" variant="secondary" onClick={() => void load()}>Try again</Button>
          </div>
        )}
        {state.kind === 'ready' && state.preferences.length === 0 && (
          <DataState
            title="No linked students are available."
            message="Please contact your school transportation office if you expected to see a student here."
          />
        )}
        {state.kind === 'ready' && state.preferences.map((preference) => (
          <PreferenceCard key={preference.studentId} preference={preference} />
        ))}
      </div>
    </DashboardLayout>
  );
}
