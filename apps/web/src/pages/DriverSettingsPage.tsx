import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';

export function DriverSettingsPage() {
  const locationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const nativeAndroid = typeof window !== 'undefined' && Boolean(window.SafeBusNativeTracking);

  return (
    <DashboardLayout
      title="Driver Settings"
      portal="driver"
      navItems={[]}
      navGroups={driverNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Settings"
          title="Trip tracking settings"
          description="Review how this device shares the active bus location."
        />

        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-900">Location access</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                SafeBus requests location access only for bus trips that you start and stops
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
                ? 'Turn on location services, allow precise location all the time, and allow notifications. Set this up while parked; SafeBus can then continue the active trip when the screen is locked.'
                : 'Turn on device location services and allow location access when your browser asks. Keep this page open during the trip so updates can continue.'}
            </p>
          </div>
        </Card>

        {nativeAndroid && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Using your personal phone</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              The same SafeBus Android app serves drivers and guardians. Your signed-in role decides
              which screens you can use. Driver tracking does not require company ownership or
              mobile-device management.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              During an active trip, SafeBus stores queued bus-location fixes and its device
              credential in encrypted app storage. It does not access your contacts, photos,
              microphone, messages, or location from other apps. A persistent Android notification
              shows while collection or required offline recovery is active.
            </p>
          </Card>
        )}

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
