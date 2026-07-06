import { useCallback, useEffect, useState } from 'react';
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; trips: AdminLiveTrip[] };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function freshnessTone(f: LocationFreshness): 'success' | 'warning' | 'neutral' {
  if (f === 'fresh') return 'success';
  if (f === 'stale') return 'warning';
  return 'neutral';
}

export function AdminLiveTripsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const trips = await fetchAdminLiveTrips();
      setState({ kind: 'ready', trips });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'We could not load active trips. Please try again.';
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Live monitoring"
          title="Live Trip Monitoring"
          description="Monitor active driver trips and latest location updates for your organization."
        />

        {state.kind === 'loading' && (
          <DataState
            title="Loading active trips"
            message="Fetching active driver trips and latest location status."
          />
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="admin-live-trips-error">
            <DataState title="We could not load active trips." message={state.message} />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.trips.length === 0 && (
          <DataState
            title="No active trips right now."
            message="Active driver trips in your organization will appear here."
          />
        )}

        {state.kind === 'ready' && state.trips.length > 0 && (
          <section className="grid gap-4" data-testid="admin-live-trips-list">
            {state.trips.map((trip) => {
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
                        {freshness === 'fresh'
                          ? 'Live location fresh'
                          : freshness === 'stale'
                            ? 'Location stale'
                            : 'No location yet'}
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
