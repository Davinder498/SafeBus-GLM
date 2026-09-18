import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useGuardianLiveBusLocations } from '@/hooks/useGuardianLiveBusLocations';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function GuardianLiveTripsPage() {
  const appSurface = useAppSurface();
  const { state, refreshing, lastRefreshedAt, refresh: load } = useGuardianLiveBusLocations();

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={[]}
      navGroups={guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Bus status"
          title="Live Bus Status"
          description="See whether the assigned bus is currently running the student's school service."
        />

        <Card className="p-4" data-ui="manual-refresh-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              disabled={refreshing}
              data-testid="guardian-live-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <span className="text-sm text-gray-600" data-testid="guardian-live-last-refreshed">
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="guardian-live-loading">
            <DataState title="Loading live bus status" message="Checking your assigned buses." />
          </div>
        )}
        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-live-error">
            <DataState
              title="We could not load bus status right now."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {state.kind === 'ready' && state.locations.length === 0 && (
          <div data-testid="guardian-live-empty">
            <DataState
              title="No linked students are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}
        {state.kind === 'ready' && state.locations.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-live-list">
            {state.locations.map((bus) => (
              <Card key={bus.studentId} className="p-5" data-testid="guardian-live-student-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{bus.studentName}</h2>
                    {bus.busNumber ? (
                      <p className="mt-1 text-base text-gray-700">
                        Bus <span className="font-semibold">{bus.busNumber}</span>
                        <span className="text-gray-500">
                          {' '}
                          · Plate {bus.licensePlate ?? 'not available'}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">No bus assigned yet.</p>
                    )}
                  </div>
                  <StatusPill
                    tone={bus.hasActiveTrip ? 'success' : 'neutral'}
                    dot={appSurface === 'native-mobile'}
                  >
                    {appSurface === 'native-mobile'
                      ? bus.hasActiveTrip
                        ? 'Active'
                        : 'Inactive'
                      : bus.hasActiveTrip
                        ? 'School run active'
                        : 'Trip not started'}
                  </StatusPill>
                </div>

                {bus.hasActiveTrip && (
                  <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
                    <p
                      className="text-base font-semibold text-navy-900"
                      data-testid="guardian-live-eta"
                    >
                      {bus.etaLabel ?? 'ETA temporarily unavailable'}
                    </p>
                    {bus.locationRecordedAt && (
                      <p className="text-sm text-gray-600">
                        Last location update:{' '}
                        <span className="font-semibold text-navy-900">
                          {formatTimestamp(bus.locationRecordedAt)}
                        </span>
                      </p>
                    )}
                    {bus.locationState === 'stale' && (
                      <p
                        className="text-sm text-warning-700"
                        data-testid="guardian-live-stale-warning"
                      >
                        Location update is delayed.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
