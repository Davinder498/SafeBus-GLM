import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout, type DashboardNavItem } from '@/components/layout/DashboardLayout';
import { GuardianLiveBusMap, type GuardianStudentContextEntry } from '@/components/guardian/GuardianLiveBusMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { mapTileConfig } from '@/config/mapTiles';
import { useGuardianLiveBusLocations } from '@/hooks/useGuardianLiveBusLocations';
import type { TrackingConnectionState } from '@/hooks/useTrackingInvalidations';
import { fetchGuardianStudentRoutes } from '@/services/guardianRouteVisibilityService';
import { getGuardianLiveRouteOverlays } from '@/services/transportationStructureService';
import { studentDisplayName, type GuardianStudentRoute } from '@/types/guardianRouteVisibility';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';
import type { RouteOverlay } from '@/types/transportation';

const guardianNavItems: DashboardNavItem[] = [
  { label: 'Live Bus Map', to: '/guardian/live-map' },
  { label: 'Bus Status', to: '/guardian/live' },
  { label: 'Pickup & Drop-off', to: '/guardian/events' },
  { label: 'My Students & Routes', to: '/guardian/routes' },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Map a safe server location_state to a non-technical guardian label and tone.
 * Never displays "stale", "missing", "invalid", or other database terms.
 */
function locationStateMeta(
  state: GuardianStudentLiveBusLocation['locationState'],
): { label: string; tone: 'success' | 'warning' | 'neutral'; description: string } {
  switch (state) {
    case 'fresh':
      return {
        label: 'Current location available',
        tone: 'success',
        description: 'The bus location is current and is shown on the map.',
      };
    case 'stale':
      return {
        label: 'Location update is delayed',
        tone: 'warning',
        description: 'The latest bus location update is delayed and is not shown on the map.',
      };
    case 'missing':
      return {
        label: 'Location has not been received',
        tone: 'neutral',
        description: 'A bus trip may be active, but no location update has been received yet.',
      };
    case 'invalid':
      return {
        label: 'Location is temporarily unavailable',
        tone: 'neutral',
        description: 'Bus location is temporarily unavailable and is not shown on the map.',
      };
  }
}

type StudentContextState =
  | { kind: 'loading' }
  | { kind: 'ready'; routes: GuardianStudentRoute[] }
  | { kind: 'error' };

/**
 * Guardian live bus map page (Milestone 11B).
 *
 * Shows a guardian-facing live bus map using ONLY the secured Milestone 11A
 * RPC for location state. Student names are joined client-side by the
 * already-authorized `student_id` from existing guardian route visibility.
 *
 * Deliberately excludes driver identity, speed, ETA, student home coordinates, location history, trip replay,
 * and direct live-location table access. Markers are rendered only for fresh
 * location state with valid coordinates.
 */
export function GuardianLiveMapPage() {
  const {
    state: locationState,
    refreshing,
    lastRefreshedAt,
    connectionState,
    refresh,
  } = useGuardianLiveBusLocations();
  // Preserve the last successful locations so the student list and map context
  // remain usable during a transient refresh failure, while never presenting
  // old data as a current live position. When locationState becomes
  // stale/missing/invalid/error, the map component renders no marker because
  // it only renders fresh rows. A refresh-failure banner explains the state.
  const lastSuccessfulLocations = useRef<GuardianStudentLiveBusLocation[]>([]);
  if (locationState.kind === 'ready') {
    lastSuccessfulLocations.current = locationState.locations;
  }
  const showRefreshError = locationState.kind === 'error' && lastSuccessfulLocations.current.length > 0;
  const effectiveLocations =
    locationState.kind === 'ready'
      ? locationState.locations
      : showRefreshError
        ? []
        : [];
  const isInitialError = locationState.kind === 'error' && lastSuccessfulLocations.current.length === 0;

  const [studentContextState, setStudentContextState] = useState<StudentContextState>({ kind: 'loading' });
  const [routeOverlays, setRouteOverlays] = useState<RouteOverlay[]>([]);

  const isMountedRef = useRef(true);

  const loadStudentContext = useCallback(async () => {
    try {
      const [routes, overlays] = await Promise.all([
        fetchGuardianStudentRoutes(),
        getGuardianLiveRouteOverlays().catch(() => []),
      ]);
      if (!isMountedRef.current) return;
      setStudentContextState({ kind: 'ready', routes });
      setRouteOverlays(overlays);
    } catch {
      if (!isMountedRef.current) return;
      // Student names are a UX enhancement only; the map can still render
      // with generic "Linked student" labels. Do not block the whole page.
      setStudentContextState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadStudentContext();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadStudentContext]);

  // Build the safe student context used for client-side name correlation.
  const studentContext = useMemo<GuardianStudentContextEntry[]>(() => {
    if (studentContextState.kind !== 'ready') return [];
    return studentContextState.routes.map((route) => ({
      studentId: route.studentId,
      studentName: studentDisplayName(route),
    }));
  }, [studentContextState]);

  // Index locations by student_id for the status list.
  const locationByStudentId = useMemo(() => {
    const map = new Map<string, GuardianStudentLiveBusLocation>();
    if (locationState.kind === 'ready') {
      for (const loc of locationState.locations) {
        map.set(loc.studentId, loc);
      }
    }
    return map;
  }, [locationState]);

  // Ordered list of students to show in the status list. Prefer authorized
  // route visibility order, then append any location-state-only rows.
  const studentRows = useMemo(() => {
    const rows: Array<{ studentId: string; studentName: string }> = [];
    const seen = new Set<string>();
    if (studentContextState.kind === 'ready') {
      for (const route of studentContextState.routes) {
        rows.push({ studentId: route.studentId, studentName: studentDisplayName(route) });
        seen.add(route.studentId);
      }
    }
    if (locationState.kind === 'ready') {
      for (const loc of locationState.locations) {
        if (!seen.has(loc.studentId)) {
          rows.push({ studentId: loc.studentId, studentName: 'Linked student' });
          seen.add(loc.studentId);
        }
      }
    }
    return rows;
  }, [studentContextState, locationState]);

  const showInitialLoading = locationState.kind === 'loading' && lastSuccessfulLocations.current.length === 0;
  const showReady = locationState.kind === 'ready' || showRefreshError;
  const showEmpty = showReady && effectiveLocations.length === 0 && studentRows.length === 0 && !showRefreshError;

  return (
    <DashboardLayout title="Parent Dashboard" portal="parent" navItems={guardianNavItems}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Live Bus Map"
          title="Live Bus Map"
          description="See the current bus location for your linked students during active trips."
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => refresh()}
              disabled={refreshing}
              data-testid="guardian-live-map-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <span
              className="text-sm text-gray-600"
              data-testid="guardian-live-map-last-refreshed"
            >
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
            <span className="text-sm text-gray-600" data-testid="guardian-live-connection-status">
              {connectionLabel(connectionState)}
            </span>
          </div>
        </Card>

        {showInitialLoading && (
          <div data-testid="guardian-live-map-loading">
            <DataState
              title="Loading live bus map"
              message="Fetching current bus location for your linked students."
            />
          </div>
        )}

        {isInitialError && (
          <div className="space-y-4" data-testid="guardian-live-map-error">
            <DataState
              title="We could not load the live bus map right now."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {showEmpty && (
          <div data-testid="guardian-live-map-empty">
            <DataState
              title="No linked students or active bus trips right now."
              message="When your child has an active trip, the bus location will appear here."
            />
          </div>
        )}

        {showReady && !showEmpty && (
          <>
            {showRefreshError && (
              <Card className="p-4" data-testid="guardian-live-map-refresh-error">
                <p role="alert" className="text-sm font-semibold text-warning-700">
                  Live location could not be refreshed. The last known status is shown, but no current bus location is displayed.
                </p>
              </Card>
            )}
            <GuardianLiveBusMap
              locations={effectiveLocations}
              overlays={routeOverlays}
              studentContext={studentContext}
              tileConfig={mapTileConfig}
            />

            {studentRows.length > 0 && (
              <section className="grid gap-4" aria-label="Student live bus status" data-testid="guardian-live-map-list">
                {studentRows.map(({ studentId, studentName }) => {
                  const loc = locationByStudentId.get(studentId);
                  const meta = loc ? locationStateMeta(loc.locationState) : null;
                  return (
                    <Card key={studentId} className="p-5" data-testid="guardian-live-map-student-card">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-navy-900">{studentName}</h3>
                          {meta && (
                            <p className="mt-1 text-sm text-gray-600">{meta.description}</p>
                          )}
                          {loc?.locationRecordedAt && (
                            <p className="mt-1 text-xs text-gray-500">
                              Last update {formatTimestamp(loc.locationRecordedAt)}
                            </p>
                          )}
                        </div>
                        {meta && (
                          <StatusPill tone={meta.tone} >
                            {meta.label}
                          </StatusPill>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </section>
            )}
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
