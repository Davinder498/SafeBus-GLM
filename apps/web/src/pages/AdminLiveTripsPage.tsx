import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AdminFleetMap, type FleetMapFormatters } from '@/components/admin/AdminFleetMap';
import { AdminTripsOverview } from '@/components/admin/AdminTripsOverview';
import { mapTileConfig } from '@/config/mapTiles';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { Select } from '@/components/ui/Select';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import { fetchAdminTripOverview } from '@/services/adminTripOverviewService';
import {
  getAdminActiveTripOperationalStatuses,
  setTripOperationalStatus,
  type AdminTripOperationalStatus,
  type TripOperationalReason,
  type TripOperationalStatusValue,
} from '@/services/phase6OperationsService';
import { getAdminLiveRouteOverlays } from '@/services/transportationStructureService';
import { useAuth } from '@/contexts/useAuth';
import {
  useTrackingInvalidations,
  type TrackingConnectionState,
} from '@/hooks/useTrackingInvalidations';
import {
  UI_STALE_LOCATION_THRESHOLD_LABEL,
  type AdminLiveTrip,
  type AdminMapViewportBounds,
  type FleetIssueLabel,
  type LocationFreshness,
} from '@/types/adminLiveMonitoring';
import type { RouteOverlay } from '@/types/transportation';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';

type TripHistoryState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; trips: AdminTripOverviewItem[] };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function locationTone(f: LocationFreshness): 'success' | 'warning' | 'danger' | 'neutral' {
  if (f === 'live') return 'success';
  if (f === 'stale') return 'warning';
  if (f === 'missing') return 'danger';
  return 'neutral';
}

function issueTone(issue: FleetIssueLabel): 'success' | 'warning' | 'danger' | 'neutral' {
  if (issue === 'OK') return 'success';
  if (issue === 'Speed unavailable') return 'neutral';
  if (issue === 'Stale GPS') return 'warning';
  return 'danger';
}

function locationLabel(f: LocationFreshness): string {
  if (f === 'live') return 'Live / recent';
  if (f === 'stale') return 'Stale';
  return 'Missing';
}

function formatSpeed(speedMps: number | null): string {
  if (typeof speedMps !== 'number' || !Number.isFinite(speedMps)) return 'Speed unavailable';
  return `${Math.round(speedMps * 3.6)} km/h`;
}

function safeFleetLabel(trip: AdminLiveTrip): string {
  if (trip.busLabel) return `Bus ${trip.busLabel}`;
  if (trip.routeName) return trip.routeName;
  return 'Active bus';
}

function connectionLabel(state: TrackingConnectionState): string {
  if (state === 'connected') return 'Live updates connected';
  if (state === 'offline') return 'Offline — fleet positions are hidden until verified';
  if (state === 'unavailable') return 'Periodic fleet checks active';
  return 'Reconnecting — fleet positions are hidden until verified';
}

const fleetMapFormatters: FleetMapFormatters = {
  formatTimestamp,
  formatSpeed,
  locationLabel,
  safeFleetLabel,
};

const OPERATIONAL_REASONS: Array<{ value: TripOperationalReason; label: string }> = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'weather', label: 'Weather' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'driver_unavailable', label: 'Driver unavailable' },
  { value: 'bus_unavailable', label: 'Bus unavailable' },
  { value: 'dispatch_unknown', label: 'Dispatch investigating' },
  { value: 'other_operational', label: 'Other operational cause' },
];

function DispatchStatusRow({
  trip,
  onUpdated,
}: {
  trip: AdminTripOperationalStatus;
  onUpdated(): Promise<void>;
}) {
  const [status, setStatus] = useState<TripOperationalStatusValue>(trip.operational_status);
  const [reason, setReason] = useState<TripOperationalReason>(
    trip.reason_code ?? 'dispatch_unknown',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setTripOperationalStatus({ tripId: trip.trip_id, status, reason });
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update dispatch status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg border border-gray-200 p-4"
      data-testid={`dispatch-status-${trip.trip_id}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-bold text-navy-900">
            Bus {trip.bus_label} · {trip.route_name}
          </p>
          <p className="mt-1 text-sm capitalize text-gray-600">Trip {trip.trip_status}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_13rem_auto]">
          <Select
            aria-label={`Operational status for bus ${trip.bus_label}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as TripOperationalStatusValue)}
          >
            <option value="normal">Normal</option>
            <option value="late">Late</option>
            <option value="missing">Missing bus</option>
          </Select>
          <Select
            aria-label={`Operational reason for bus ${trip.bus_label}`}
            value={reason}
            disabled={status === 'normal'}
            onChange={(event) => setReason(event.target.value as TripOperationalReason)}
          >
            {OPERATIONAL_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" loading={saving} onClick={() => void save()}>
            Update
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminLiveTripsPage() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<AdminLiveTrip[]>([]);
  const [routeOverlays, setRouteOverlays] = useState<RouteOverlay[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [tripHistory, setTripHistory] = useState<TripHistoryState>({ kind: 'loading' });
  const [dispatchStatuses, setDispatchStatuses] = useState<AdminTripOperationalStatus[]>([]);
  const fetchingRef = useRef(false);
  const pendingLoadRef = useRef(false);
  const viewportBoundsRef = useRef<AdminMapViewportBounds | null>(null);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<(opts: { background: boolean }) => void>(() => undefined);
  const isMountedRef = useRef(true);

  const load = useCallback(async (opts: { background: boolean }) => {
    if (fetchingRef.current) {
      pendingLoadRef.current = true;
      return;
    }
    fetchingRef.current = true;
    if (opts.background) {
      setRefreshing(true);
      setRefreshError(null);
    } else {
      setInitialLoading(true);
      setInitialError(null);
    }
    try {
      const [nextTrips, nextOverlays, nextDispatchStatuses] = await Promise.all([
        fetchAdminLiveTrips(viewportBoundsRef.current),
        getAdminLiveRouteOverlays().catch(() => []),
        getAdminActiveTripOperationalStatuses().catch(() => []),
      ]);
      if (!isMountedRef.current) return;
      setTrips(nextTrips);
      setRouteOverlays(nextOverlays);
      setDispatchStatuses(nextDispatchStatuses);
      setLastRefreshedAt(new Date().toISOString());
      setRefreshError(null);
      if (!opts.background) setInitialLoading(false);
    } catch {
      if (!isMountedRef.current) return;
      if (opts.background) {
        setRefreshError('Refresh failed. The last successful list is still shown.');
      } else {
        setInitialError('We could not load active trips. Please try again.');
        setInitialLoading(false);
      }
    } finally {
      if (isMountedRef.current) setRefreshing(false);
      fetchingRef.current = false;
      if (pendingLoadRef.current && isMountedRef.current) {
        pendingLoadRef.current = false;
        queueMicrotask(() => loadRef.current({ background: true }));
      }
    }
  }, []);
  loadRef.current = (opts) => void load(opts);

  const loadTripHistory = useCallback(async () => {
    setTripHistory({ kind: 'loading' });
    try {
      const history = await fetchAdminTripOverview(50);
      if (isMountedRef.current) setTripHistory({ kind: 'ready', trips: history });
    } catch {
      if (isMountedRef.current) setTripHistory({ kind: 'error' });
    }
  }, []);

  const handleRealtimeInvalidate = useCallback(() => {
    void load({ background: true });
  }, [load]);

  const handleViewportChange = useCallback((bounds: AdminMapViewportBounds) => {
    viewportBoundsRef.current = bounds;
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    viewportDebounceRef.current = setTimeout(() => {
      void loadRef.current({ background: true });
    }, 400);
  }, []);

  const clearUnverifiedFleetCoordinates = useCallback(() => {
    setTrips((current) =>
      current.map((trip) => ({
        ...trip,
        latestLatitude: null,
        latestLongitude: null,
      })),
    );
  }, []);

  const connectionState = useTrackingInvalidations({
    topic: profile?.tenant_id ? `safebus:tenant:${profile.tenant_id}` : null,
    onInvalidate: handleRealtimeInvalidate,
    onDisconnected: clearUnverifiedFleetCoordinates,
  });

  useEffect(() => {
    isMountedRef.current = true;
    void load({ background: false });
    void loadTripHistory();
    return () => {
      isMountedRef.current = false;
      if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    };
  }, [load, loadTripHistory]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load({ background: true });
    }, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load({ background: true });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const summary = useMemo(() => {
    const stale = trips.filter((trip) => trip.locationStatus === 'stale').length;
    const missing = trips.filter((trip) => trip.locationStatus === 'missing').length;
    const needsAttention = trips.filter((trip) => trip.locationStatus !== 'live').length;
    return { active: trips.length, stale, missing, needsAttention };
  }, [trips]);

  const showInitialError = !initialLoading && initialError !== null;
  const showReady = !initialLoading && initialError === null;

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Live monitoring"
          title="Live Operations"
          description="Monitor active buses on the map, review current trip details, and access recent trip history in one place."
        />

        {showReady && (
          <Card className="p-4" data-testid="admin-live-trips-controls">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void load({ background: true })}
                disabled={refreshing}
                data-testid="admin-live-trips-refresh-button"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
              <div className="flex flex-col gap-1 text-sm text-gray-600 sm:items-end">
                <span data-testid="admin-live-trips-last-refreshed">
                  {lastRefreshedAt
                    ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                    : 'Not refreshed yet'}
                </span>
                <span>
                  Stale GPS threshold: {UI_STALE_LOCATION_THRESHOLD_LABEL} (UI status only)
                </span>
                <span data-testid="admin-live-connection-status">
                  {connectionLabel(connectionState)}
                </span>
              </div>
            </div>
            {refreshError && (
              <p
                role="alert"
                data-testid="admin-live-trips-refresh-error"
                className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700"
              >
                {refreshError}
              </p>
            )}
          </Card>
        )}

        {initialLoading && (
          <DataState
            title="Loading active fleet"
            message="Fetching active buses and latest operational location status."
          />
        )}

        {showInitialError && (
          <div className="space-y-4" data-testid="admin-live-trips-error">
            <DataState title="We could not load active trips." message="Please try again." />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load({ background: false })}
            >
              Try again
            </Button>
          </div>
        )}

        {showReady && (
          <>
            <section className="grid gap-4 md:grid-cols-4" data-testid="admin-live-fleet-summary">
              {[
                ['Active trips', summary.active],
                ['Stale locations', summary.stale],
                ['Missing locations', summary.missing],
                ['Needs attention', summary.needsAttention],
              ].map(([label, value]) => (
                <Card key={label} className="p-5">
                  <p className="text-sm font-semibold text-gray-600">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-navy-900">{value}</p>
                </Card>
              ))}
            </section>

            <Card className="p-5" data-testid="admin-dispatch-status">
              <h2 className="text-lg font-bold text-navy-900">Late / missing bus status</h2>
              <p className="mt-1 text-sm text-gray-600">
                Dispatcher-reported operational status only. No ETA is calculated from these values.
              </p>
              <div className="mt-4 space-y-3">
                {dispatchStatuses.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No active or paused trips require dispatch status.
                  </p>
                ) : (
                  dispatchStatuses.map((trip) => (
                    <DispatchStatusRow
                      key={trip.trip_id}
                      trip={trip}
                      onUpdated={async () => {
                        setDispatchStatuses(await getAdminActiveTripOperationalStatuses());
                      }}
                    />
                  ))
                )}
              </div>
            </Card>

            <AdminFleetMap
              trips={trips}
              overlays={routeOverlays}
              onViewportChange={handleViewportChange}
              tileConfig={mapTileConfig}
              formatters={fleetMapFormatters}
            />

            {trips.length === 0 ? (
              <DataState
                title="No active trips right now."
                message="Active driver trips in your organization will appear here."
              />
            ) : (
              <Card className="overflow-hidden" data-testid="admin-live-trips-list">
                <div className="border-b border-gray-100 p-5">
                  <h2 className="text-lg font-bold text-navy-900">Active trips</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-4 py-3">Bus</th>
                        <th className="px-4 py-3">Route / trip</th>
                        <th className="px-4 py-3">Driver</th>
                        <th className="px-4 py-3">Trip status</th>
                        <th className="px-4 py-3">Latest update</th>
                        <th className="px-4 py-3">Speed</th>
                        <th className="px-4 py-3">Location status</th>
                        <th className="px-4 py-3">ETA / progress</th>
                        <th className="px-4 py-3">Issue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {trips.map((trip, index) => (
                        <tr
                          key={`${safeFleetLabel(trip)}-${trip.startedAt}-${index}`}
                          data-testid="admin-live-trip-card"
                        >
                          <td className="px-4 py-3 font-semibold text-navy-900">
                            {trip.busLabel ? `Bus ${trip.busLabel}` : 'Bus label unavailable'}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <span className="font-semibold text-navy-900">
                              {trip.routeName ?? 'Route unavailable'}
                            </span>
                            {trip.tripType && (
                              <span className="block capitalize text-gray-600">
                                {trip.tripType}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {trip.driverName ?? 'Driver unavailable'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone="success">{trip.status}</StatusPill>
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700"
                            data-testid="admin-live-trip-location-time"
                          >
                            {trip.latestLocationAt
                              ? formatTimestamp(trip.latestLocationAt)
                              : 'No GPS update yet'}
                          </td>
                          <td
                            className="px-4 py-3 font-semibold text-navy-900"
                            data-testid="admin-live-trip-speed"
                          >
                            {formatSpeed(trip.speedMps)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone={locationTone(trip.locationStatus)}>
                              {locationLabel(trip.locationStatus)}
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 text-gray-700" data-testid="admin-live-trip-eta">
                            <span className="font-semibold text-navy-900">
                              {trip.etaStatus === 'available'
                                ? trip.etaLabel
                                : (trip.etaLabel ?? 'ETA temporarily unavailable')}
                            </span>
                            {trip.nextStopName && (
                              <span className="block text-xs text-gray-500">
                                Next: {trip.nextStopName}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone={issueTone(trip.issueLabel)}>
                              {trip.issueLabel}
                            </StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        <section aria-label="Recent trip history" id="history">
          {tripHistory.kind === 'loading' && (
            <DataState
              title="Loading trip history"
              message="Loading recent completed and cancelled runs."
            />
          )}
          {tripHistory.kind === 'error' && (
            <div className="space-y-4">
              <DataState
                title="Could not load trip history"
                message="Live monitoring is still available. Try loading the history again."
              />
              <Button type="button" variant="secondary" onClick={() => void loadTripHistory()}>
                Try again
              </Button>
            </div>
          )}
          {tripHistory.kind === 'ready' && (
            <AdminTripsOverview
              trips={tripHistory.trips}
              showLiveLink={false}
              initialFilter="non-active"
              title="Recent trip history"
              description="Review dated trip runs without leaving live operations. Use All trips for the complete history view."
            />
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
