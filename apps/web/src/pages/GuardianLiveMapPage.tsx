import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { GuardianLiveBusMap } from '@/components/guardian/GuardianLiveBusMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { mapTileConfig } from '@/config/mapTiles';
import { useGuardianLiveBusLocations } from '@/hooks/useGuardianLiveBusLocations';
import type { TrackingConnectionState } from '@/hooks/useTrackingInvalidations';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function locationStateMeta(state: GuardianStudentLiveBusLocation['locationState']): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
  description: string;
} {
  if (state === 'fresh')
    return {
      label: 'Current location available',
      tone: 'success',
      description: 'The bus location is current and shown on the map.',
    };
  if (state === 'stale')
    return {
      label: 'Location update delayed',
      tone: 'warning',
      description: 'The latest update is delayed, so the bus is not shown on the map.',
    };
  if (state === 'missing')
    return {
      label: 'Waiting for location',
      tone: 'neutral',
      description: 'The school run is active, but a location has not been received yet.',
    };
  if (state === 'invalid')
    return {
      label: 'Location unavailable',
      tone: 'neutral',
      description: 'The bus location is temporarily unavailable.',
    };
  return {
    label: 'Not active right now',
    tone: 'neutral',
    description: 'The assigned bus is not currently running this student’s school service.',
  };
}

export function GuardianLiveMapPage() {
  const { state, refreshing, lastRefreshedAt, connectionState, refresh } =
    useGuardianLiveBusLocations();

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={[]}
      navGroups={guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Live bus map"
          title="Live Bus Map"
          description="See the bus only while it is running the school service assigned to your linked student."
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={refresh}
              disabled={refreshing}
              data-testid="guardian-live-map-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <span className="text-sm text-gray-600" data-testid="guardian-live-map-last-refreshed">
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
            <span className="text-sm text-gray-600" data-testid="guardian-live-connection-status">
              {connectionLabel(connectionState)}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="guardian-live-map-loading">
            <DataState title="Loading live bus map" message="Checking the current bus location." />
          </div>
        )}
        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-live-map-error">
            <DataState
              title="We could not load the live bus map right now."
              message="No unverified location is displayed. Please try again."
            />
            <Button type="button" variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        )}
        {state.kind === 'ready' && state.locations.length === 0 && (
          <div data-testid="guardian-live-map-empty">
            <DataState
              title="No linked students are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}
        {state.kind === 'ready' && state.locations.length > 0 && (
          <>
            <GuardianLiveBusMap locations={state.locations} tileConfig={mapTileConfig} />
            <section
              className="grid gap-4"
              aria-label="Student bus status"
              data-testid="guardian-live-map-list"
            >
              {state.locations.map((bus) => {
                const meta = locationStateMeta(bus.locationState);
                return (
                  <Card
                    key={bus.studentId}
                    className="p-5"
                    data-testid="guardian-live-map-student-card"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-navy-900">{bus.studentName}</h3>
                        {bus.busNumber ? (
                          <p className="mt-1 text-sm text-gray-600">
                            Bus <span className="font-semibold text-navy-900">{bus.busNumber}</span>{' '}
                            · Plate {bus.licensePlate ?? 'not available'}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-gray-600">No bus assigned yet.</p>
                        )}
                        <p className="mt-2 text-sm text-gray-600">{meta.description}</p>
                        {bus.locationRecordedAt && (
                          <p className="mt-1 text-xs text-gray-500">
                            Last update {formatTimestamp(bus.locationRecordedAt)}
                          </p>
                        )}
                      </div>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    </div>
                  </Card>
                );
              })}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function connectionLabel(state: TrackingConnectionState): string {
  if (state === 'connected') return 'Live updates connected';
  if (state === 'offline') return 'Offline — updates resume when your connection returns';
  if (state === 'unavailable') return 'Periodic location checks active';
  return 'Reconnecting to live updates';
}
