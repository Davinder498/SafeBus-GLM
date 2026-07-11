import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import {
  hasValidCoordinates,
  UI_STALE_LOCATION_THRESHOLD_LABEL,
  type AdminLiveTrip,
  type FleetIssueLabel,
  type LocationFreshness,
} from '@/types/adminLiveMonitoring';

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

function FleetMap({ trips }: { trips: AdminLiveTrip[] }) {
  const markerTrips = trips.filter(hasValidCoordinates);
  const bounds = useMemo(() => {
    if (markerTrips.length === 0) return null;
    const latitudes = markerTrips.map((trip) => trip.latestLatitude as number);
    const longitudes = markerTrips.map((trip) => trip.latestLongitude as number);
    return {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };
  }, [markerTrips]);

  if (!bounds) {
    return (
      <Card className="p-5" data-testid="admin-live-fleet-map-empty">
        <h2 className="text-lg font-bold text-navy-900">Live fleet map</h2>
        <DataState
          title="No active buses with valid coordinates."
          message="Active trips are listed below. Map markers appear after a current GPS update includes valid coordinates."
        />
      </Card>
    );
  }

  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.01);

  return (
    <Card className="overflow-hidden" data-testid="admin-live-fleet-map">
      <div className="border-b border-gray-100 p-5">
        <h2 className="text-lg font-bold text-navy-900">Live fleet map</h2>
        <p className="mt-1 text-sm text-gray-600">
          Operational marker positions for active buses with valid current coordinates. Labels show bus or route only.
        </p>
      </div>
      <div className="relative h-80 bg-gradient-to-br from-sky-50 via-white to-emerald-50" aria-label="Admin live fleet coordinate map">
        <div className="absolute inset-0 opacity-50" aria-hidden="true">
          <div className="h-full w-full bg-[linear-gradient(to_right,rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>
        {markerTrips.map((trip, index) => {
          const lat = trip.latestLatitude as number;
          const lng = trip.latestLongitude as number;
          const left = 8 + ((lng - bounds.minLng) / lngSpan) * 84;
          const top = 8 + ((bounds.maxLat - lat) / latSpan) * 84;
          return (
            <div
              key={`${safeFleetLabel(trip)}-${trip.startedAt}-${index}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-navy-700 px-3 py-2 text-xs font-bold text-white shadow-lg"
              style={{ left: `${left}%`, top: `${top}%` }}
              data-testid="admin-live-fleet-map-marker"
              title={`${safeFleetLabel(trip)} · ${trip.routeName ?? 'Active route'}`}
            >
              {safeFleetLabel(trip)}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function AdminLiveTripsPage() {
  const [trips, setTrips] = useState<AdminLiveTrip[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const load = useCallback(async (opts: { background: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (opts.background) {
      setRefreshing(true);
      setRefreshError(null);
    } else {
      setInitialLoading(true);
      setInitialError(null);
    }
    try {
      const nextTrips = await fetchAdminLiveTrips();
      if (!isMountedRef.current) return;
      setTrips(nextTrips);
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
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void load({ background: false });
    return () => {
      isMountedRef.current = false;
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
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Live monitoring"
          title="Live Fleet Monitoring"
          description="Monitor active buses, current GPS freshness, and safely available speed for your organization."
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
                  {lastRefreshedAt ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}` : 'Not refreshed yet'}
                </span>
                <span>Stale GPS threshold: {UI_STALE_LOCATION_THRESHOLD_LABEL} (UI status only)</span>
              </div>
            </div>
            {refreshError && (
              <p role="alert" data-testid="admin-live-trips-refresh-error" className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
                {refreshError}
              </p>
            )}
          </Card>
        )}

        {initialLoading && <DataState title="Loading active fleet" message="Fetching active buses and latest operational location status." />}

        {showInitialError && (
          <div className="space-y-4" data-testid="admin-live-trips-error">
            <DataState title="We could not load active trips." message="Please try again." />
            <Button type="button" variant="secondary" onClick={() => void load({ background: false })}>Try again</Button>
          </div>
        )}

        {showReady && (
          <>
            <section className="grid gap-4 md:grid-cols-4" data-testid="admin-live-fleet-summary">
              {[
                ['Active trips / buses', summary.active],
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

            <FleetMap trips={trips} />

            {trips.length === 0 ? (
              <DataState title="No active trips right now." message="Active driver trips in your organization will appear here." />
            ) : (
              <Card className="overflow-hidden" data-testid="admin-live-trips-list">
                <div className="border-b border-gray-100 p-5">
                  <h2 className="text-lg font-bold text-navy-900">Active fleet list</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-4 py-3">Bus</th>
                        <th className="px-4 py-3">Route</th>
                        <th className="px-4 py-3">Driver</th>
                        <th className="px-4 py-3">Trip status</th>
                        <th className="px-4 py-3">Latest update</th>
                        <th className="px-4 py-3">Speed</th>
                        <th className="px-4 py-3">Location status</th>
                        <th className="px-4 py-3">Issue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {trips.map((trip, index) => (
                        <tr key={`${safeFleetLabel(trip)}-${trip.startedAt}-${index}`} data-testid="admin-live-trip-card">
                          <td className="px-4 py-3 font-semibold text-navy-900">{trip.busLabel ? `Bus ${trip.busLabel}` : 'Bus label unavailable'}</td>
                          <td className="px-4 py-3 text-gray-700">{trip.routeName ?? 'Route unavailable'}</td>
                          <td className="px-4 py-3 text-gray-700">{trip.driverName ?? 'Driver unavailable'}</td>
                          <td className="px-4 py-3"><StatusPill tone="success">{trip.status}</StatusPill></td>
                          <td className="px-4 py-3 text-gray-700" data-testid="admin-live-trip-location-time">{trip.latestLocationAt ? formatTimestamp(trip.latestLocationAt) : 'No GPS update yet'}</td>
                          <td className="px-4 py-3 font-semibold text-navy-900" data-testid="admin-live-trip-speed">{formatSpeed(trip.speedMps)}</td>
                          <td className="px-4 py-3"><StatusPill tone={locationTone(trip.locationStatus)}>{locationLabel(trip.locationStatus)}</StatusPill></td>
                          <td className="px-4 py-3"><StatusPill tone={issueTone(trip.issueLabel)}>{trip.issueLabel}</StatusPill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
