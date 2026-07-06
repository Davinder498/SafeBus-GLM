import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import {
  classifyFreshness,
  type AdminLiveTrip,
  type LocationFreshness,
} from '@/types/adminLiveMonitoring';

/** Polling interval for background refresh (20 seconds). */
const POLL_INTERVAL_MS = 20_000;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function freshnessTone(f: LocationFreshness): 'success' | 'warning' | 'danger' | 'neutral' {
  if (f === 'fresh') return 'success';
  if (f === 'stale') return 'warning';
  if (f === 'offline') return 'danger';
  return 'neutral';
}

function freshnessLabel(f: LocationFreshness): string {
  if (f === 'fresh') return 'Live location fresh';
  if (f === 'stale') return 'Location stale';
  if (f === 'offline') return 'Location offline';
  return 'No location yet';
}

export function AdminLiveTripsPage() {
  // Trip data + initial-load state (full loading / error screen).
  const [trips, setTrips] = useState<AdminLiveTrip[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Background-refresh state (non-destructive: preserves the existing list).
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Optional pause/resume for polling. Manual refresh works while paused.
  const [paused, setPaused] = useState(false);

  // Guard against overlapping fetches (poll + manual refresh racing).
  const fetchingRef = useRef(false);
  // Guard against setting state after unmount.
  const isMountedRef = useRef(true);

  /**
   * Shared load path for initial load, manual refresh, and polling.
   *
   * - background=true: preserves the existing trip list while refreshing; sets
   *   `refreshing` and does NOT touch `initialLoading`/`initialError`. On
   *   failure, keeps the last successful list and surfaces a non-destructive
   *   `refreshError` (does not clear `lastRefreshedAt`).
   * - background=false (initial): full loading screen; on failure sets
   *   `initialError`.
   *
   * On success: updates `trips`, clears `refreshError`, sets `lastRefreshedAt`.
   * The `fetchingRef` guard prevents overlapping fetch storms.
   */
  const load = useCallback(async (opts: { background: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (opts.background) {
      setRefreshing(true);
      // Clear any previous non-destructive refresh error when a new refresh
      // starts, but do NOT clear lastRefreshedAt (that stays from the last
      // successful fetch).
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
      if (!opts.background) {
        setInitialLoading(false);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof Error ? err.message : 'Refresh failed. The last successful list is still shown.';
      if (opts.background) {
        // Non-destructive: keep existing trips + lastRefreshedAt; surface error.
        setRefreshError(message);
      } else {
        setInitialError(message);
        setInitialLoading(false);
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
      fetchingRef.current = false;
    }
  }, []);

  // Initial load on mount.
  useEffect(() => {
    isMountedRef.current = true;
    void load({ background: false });
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  // Polling: every POLL_INTERVAL_MS when not paused. Cleared on unmount or
  // when pause toggles. The `load` guard prevents overlapping fetches if a
  // poll fires while a manual refresh is still in flight.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      void load({ background: true });
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [load, paused]);

  const handleManualRefresh = useCallback(() => {
    void load({ background: true });
  }, [load]);

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  const showInitialLoading = initialLoading;
  const showInitialError = !initialLoading && initialError !== null;
  const showReady = !initialLoading && initialError === null;

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Live monitoring"
          title="Live Trip Monitoring"
          description="Monitor active driver trips and latest location updates for your organization."
        />

        {showReady && (
          <Card className="p-4" data-testid="admin-live-trips-controls">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleManualRefresh}
                  disabled={refreshing}
                  data-testid="admin-live-trips-refresh-button"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleTogglePause}
                  data-testid="admin-live-trips-pause-button"
                >
                  {paused ? 'Resume refresh' : 'Pause refresh'}
                </Button>
              </div>
              <div className="flex flex-col gap-1 text-sm text-gray-600 sm:items-end">
                <span data-testid="admin-live-trips-last-refreshed">
                  {lastRefreshedAt
                    ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                    : 'Not refreshed yet'}
                </span>
                {refreshing && (
                  <span
                    role="status"
                    aria-live="polite"
                    data-testid="admin-live-trips-refreshing"
                    className="text-gray-500"
                  >
                    Refreshing…
                  </span>
                )}
                {paused && (
                  <span className="text-gray-500">Auto-refresh paused</span>
                )}
              </div>
            </div>
            {refreshError && (
              <p
                role="alert"
                aria-live="assertive"
                data-testid="admin-live-trips-refresh-error"
                className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700"
              >
                Refresh failed: {refreshError}. The last successful list is still shown.
              </p>
            )}
          </Card>
        )}

        {showInitialLoading && (
          <DataState
            title="Loading active trips"
            message="Fetching active driver trips and latest location status."
          />
        )}

        {showInitialError && (
          <div className="space-y-4" data-testid="admin-live-trips-error">
            <DataState title="We could not load active trips." message={initialError ?? ''} />
            <Button type="button" variant="secondary" onClick={() => void load({ background: false })}>
              Try again
            </Button>
          </div>
        )}

        {showReady && trips.length === 0 && (
          <DataState
            title="No active trips right now."
            message="Active driver trips in your organization will appear here."
          />
        )}

        {showReady && trips.length > 0 && (
          <section className="grid gap-4" data-testid="admin-live-trips-list">
            {trips.map((trip) => {
              const freshness = classifyFreshness(trip.latestLocationAt);
              return (
                <Card key={trip.tripId} className="p-5" data-testid="admin-live-trip-card">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-navy-900">
                        {trip.routeName ?? 'Active route'}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Bus {trip.busLabel ?? trip.busId} &middot;{' '}
                        {trip.tripType ?? 'trip'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Driver: {trip.driverName ?? trip.driverEmail ?? 'Unknown'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Started {formatTimestamp(trip.startedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <StatusPill tone="success">{trip.status}</StatusPill>
                      <StatusPill tone={freshnessTone(freshness)}>
                        {freshnessLabel(freshness)}
                      </StatusPill>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <p className="text-gray-600">
                      Latest location:{' '}
                      <span className="font-semibold text-navy-900" data-testid="admin-live-trip-location">
                        {trip.latestLatitude != null && trip.latestLongitude != null
                          ? `${trip.latestLatitude.toFixed(5)}, ${trip.latestLongitude.toFixed(5)}`
                          : 'Waiting for first location update.'}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Location updated:{' '}
                      <span className="font-semibold text-navy-900" data-testid="admin-live-trip-location-time">
                        {trip.latestLocationAt ? formatTimestamp(trip.latestLocationAt) : '—'}
                      </span>
                    </p>
                  </div>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
