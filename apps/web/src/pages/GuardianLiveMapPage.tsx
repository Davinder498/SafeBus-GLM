import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { GuardianLiveBusMap } from '@/components/guardian/GuardianLiveBusMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useGuardianLiveBusLocations } from '@/hooks/useGuardianLiveBusLocations';
import { useMapTileConfig } from '@/hooks/useMapTileConfig';
import type { TrackingConnectionState } from '@/hooks/useTrackingInvalidations';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';
import { useSearchParams } from 'react-router';
import { groupGuardianBuses } from '@/utils/guardianBusGroups';

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
    label: 'Trip not started',
    tone: 'neutral',
    description: 'The assigned bus is not currently running this student’s school service.',
  };
}

export function GuardianLiveMapPage() {
  const appSurface = useAppSurface();
  const [searchParams] = useSearchParams();
  const selectedBusNumber =
    appSurface === 'native-mobile' ? (searchParams.get('bus')?.trim() ?? '') : '';
  const { state, refreshing, lastRefreshedAt, connectionState, refresh } =
    useGuardianLiveBusLocations();
  const mapTileConfig = useMapTileConfig();
  const busGroups = state.kind === 'ready' ? groupGuardianBuses(state.locations) : [];
  const visibleGroups =
    appSurface === 'native-mobile'
      ? selectedBusNumber
        ? busGroups.filter(
            (group) =>
              group.busNumber?.toLocaleLowerCase() === selectedBusNumber.toLocaleLowerCase(),
          )
        : busGroups
      : state.kind === 'ready'
        ? state.locations.flatMap((location) => groupGuardianBuses([location]))
        : [];
  const visibleLocations = visibleGroups.map((group) => group.visibility);

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
          title={selectedBusNumber ? `Bus ${selectedBusNumber} Live Map` : 'Live Bus Map'}
          description="See the bus only while it is running the school service assigned to your linked student."
        />

        <Card className="p-4" data-ui="manual-refresh-card">
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
        {state.kind === 'ready' && visibleLocations.length === 0 && (
          <div data-testid="guardian-live-map-empty">
            <DataState
              title={selectedBusNumber ? 'This bus is not available.' : 'No linked students are available yet.'}
              message={
                selectedBusNumber
                  ? 'Its assignment may have changed. Return to My Buses to see current assignments.'
                  : 'Please contact your school transportation office.'
              }
            />
          </div>
        )}
        {state.kind === 'ready' && visibleLocations.length > 0 && (
          <>
            <GuardianLiveBusMap locations={visibleLocations} tileConfig={mapTileConfig} />
            <section
              className="grid gap-4"
              aria-label="Student bus status"
              data-testid="guardian-live-map-list"
            >
              {visibleGroups.map((group) => {
                const bus = group.visibility;
                const meta = locationStateMeta(bus.locationState);
                return (
                  <Card
                    key={group.key}
                    className="p-5"
                    data-testid="guardian-live-map-student-card"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-navy-900">
                          {appSurface === 'native-mobile' && bus.busNumber
                            ? `Bus ${bus.busNumber}`
                            : bus.studentName}
                        </h3>
                        {appSurface === 'native-mobile' && (
                          <p className="mt-1 text-sm font-medium text-gray-600">
                            {group.students.map((student) => student.studentName).join(', ')}
                          </p>
                        )}
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
