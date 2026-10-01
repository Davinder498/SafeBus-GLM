import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useCallback } from 'react';
import { ArrowLeft, BusFront } from 'lucide-react';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { GuardianLiveBusMap } from '@/components/guardian/GuardianLiveBusMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useGuardianLiveBusLocations } from '@/hooks/useGuardianLiveBusLocations';
import { useVerifiedGuardianData } from '@/hooks/useVerifiedGuardianData';
import { useMapTileConfig } from '@/hooks/useMapTileConfig';
import type { TrackingConnectionState } from '@/hooks/useTrackingInvalidations';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';
import { Link, useSearchParams } from 'react-router';
import { fetchGuardianBusServiceLines } from '@/services/guardianLiveBusLocationService';
import { groupGuardianBuses, type GuardianBusGroup } from '@/utils/guardianBusGroups';

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
  const selectedBusNumber = searchParams.get('bus')?.trim() ?? '';
  const { state, refreshing, lastRefreshedAt, connectionState, refresh } =
    useGuardianLiveBusLocations();
  const mapTileConfig = useMapTileConfig();
  const busGroups = state.kind === 'ready' ? groupGuardianBuses(state.locations) : [];
  const visibleGroups = selectedBusNumber
    ? busGroups.filter(
        (group) => group.busNumber?.toLocaleLowerCase() === selectedBusNumber.toLocaleLowerCase(),
      )
    : [];
  const visibleLocations = visibleGroups.map((group) => group.visibility);
  const fetchSelectedServiceLines = useCallback(
    (signal: AbortSignal) =>
      selectedBusNumber
        ? fetchGuardianBusServiceLines(selectedBusNumber, signal)
        : Promise.resolve([]),
    [selectedBusNumber],
  );
  const { state: serviceLineState } = useVerifiedGuardianData(
    fetchSelectedServiceLines,
    `live-map:${selectedBusNumber}`,
  );
  const serviceLines = serviceLineState.kind === 'ready' ? serviceLineState.data : [];

  if (appSurface === 'native-mobile') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        data-ui="guardian-map-shell"
        data-portal="parent"
        data-testid="guardian-fullscreen-map"
      >
        <header
          className="z-10 flex min-h-16 items-center gap-3 border-b px-4"
          data-ui="guardian-map-app-bar"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <Link
            to="/parent"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-navy-700"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-6 w-6" aria-hidden />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-navy-900">
            {selectedBusNumber ? `Bus ${selectedBusNumber} live map` : 'Live bus map'}
          </h1>
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
        </header>
        <main
          className="relative min-h-0 flex-1"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {state.kind === 'loading' && (
            <DataState title="Loading live bus map" message="Checking the current bus location." />
          )}
          {state.kind === 'error' && (
            <div data-testid="guardian-live-map-error">
              <DataState
                title="We could not load the live bus map right now."
                message="Please try again."
              />
            </div>
          )}
          {state.kind === 'ready' && !selectedBusNumber && (
            <BusChooser groups={busGroups} compact />
          )}
          {state.kind === 'ready' && selectedBusNumber && visibleLocations.length === 0 && (
            <div data-testid="guardian-live-map-empty">
              <DataState
                title={
                  selectedBusNumber
                    ? 'This bus is not available.'
                    : 'No linked students are available yet.'
                }
                message="Return to Home to see current assignments."
              />
            </div>
          )}
          {state.kind === 'ready' && visibleLocations.length > 0 && (
            <>
              <GuardianLiveBusMap
                locations={visibleLocations}
                serviceLines={serviceLines}
                tileConfig={mapTileConfig}
                fullScreen
              />
              {serviceLineState.kind === 'error' && (
                <p
                  className="absolute left-4 right-4 top-4 rounded-xl p-3 text-center text-sm font-semibold text-navy-900 shadow-lg"
                  data-ui="guardian-map-message"
                  role="status"
                >
                  Pickup and drop-off locations are temporarily unavailable.
                </p>
              )}
              {!visibleLocations.some((location) => location.locationState === 'fresh') && (
                <p
                  className="absolute bottom-4 left-4 right-4 rounded-xl p-3 text-center text-sm font-semibold text-navy-900 shadow-lg"
                  data-ui="guardian-map-message"
                  role="status"
                >
                  No current bus location to show right now.
                </p>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

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
        {state.kind === 'ready' && !selectedBusNumber && <BusChooser groups={busGroups} />}
        {state.kind === 'ready' && selectedBusNumber && visibleLocations.length === 0 && (
          <div data-testid="guardian-live-map-empty">
            <DataState
              title={
                selectedBusNumber
                  ? 'This bus is not available.'
                  : 'No linked students are available yet.'
              }
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
            <GuardianLiveBusMap
              locations={visibleLocations}
              serviceLines={serviceLines}
              tileConfig={mapTileConfig}
            />
            {serviceLineState.kind === 'error' && (
              <Card className="p-4" role="status">
                <p className="text-sm text-gray-600">
                  Pickup and drop-off locations are temporarily unavailable. The verified bus
                  location remains visible.
                </p>
              </Card>
            )}
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

function BusChooser({
  groups,
  compact = false,
}: {
  groups: GuardianBusGroup[];
  compact?: boolean;
}) {
  const assignedGroups = groups.filter((group) => group.busNumber);
  if (assignedGroups.length === 0) {
    return (
      <DataState
        title="No assigned buses are available yet."
        message="Please contact your school transportation office."
      />
    );
  }

  return (
    <div
      className={
        compact
          ? 'h-full overflow-y-auto bg-slate-50 p-4'
          : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
      }
      data-testid="guardian-live-map-bus-chooser"
    >
      <div className={compact ? 'mx-auto max-w-md' : ''}>
        <h2 className="text-lg font-bold text-navy-900">Choose a bus</h2>
        <p className="mt-1 text-sm text-gray-600">
          Select a bus to see its live location and assigned pickup and drop-off stops.
        </p>
        <div className="mt-4 grid gap-3">
          {assignedGroups.map((group) => (
            <Link
              key={group.key}
              to={`/guardian/live-map?bus=${encodeURIComponent(group.busNumber ?? '')}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-navy-900 shadow-sm hover:border-navy-300 hover:bg-navy-50"
            >
              <span className="flex items-center gap-3">
                <BusFront className="h-5 w-5 text-navy-700" aria-hidden />
                Bus {group.busNumber}
              </span>
              <span className="text-sm font-semibold text-gray-500">
                {group.students.length} student{group.students.length === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function connectionLabel(state: TrackingConnectionState): string {
  if (state === 'connected') return 'Live updates connected';
  if (state === 'offline') return 'Offline — updates resume when your connection returns';
  if (state === 'unavailable') return 'Periodic location checks active';
  return 'Reconnecting to live updates';
}
