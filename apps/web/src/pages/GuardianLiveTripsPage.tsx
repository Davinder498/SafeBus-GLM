import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, type DashboardNavItem } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianLiveTrips } from '@/services/guardianLiveTripService';
import type { GuardianLiveTrip } from '@/types/guardianLiveTrip';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; trips: GuardianLiveTrip[] };

// A status update older than this is flagged as potentially delayed. This is a
// UI-only, non-alarming heuristic. It does NOT estimate location or ETA.
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

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
 * Returns true when the latest status update is older than STALE_AFTER_MS.
 * Used only to show a gentle "Status may be delayed" note, never an ETA.
 */
function isStale(recordedAt: string | null, now: number = Date.now()): boolean {
  if (!recordedAt) return false;
  const ts = new Date(recordedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts > STALE_AFTER_MS;
}

/**
 * Guardian live trip status page (Milestone 6B).
 *
 * Shows safe, text-only live trip status for the guardian's linked students by
 * calling the secure get_guardian_live_trip_visibility() RPC from Milestone 6A.
 *
 * Deliberately does NOT render map, GPS coordinates, speed, ETA, route polyline,
 * bus/driver/trip UUIDs, or any operational/admin-only fields. The page trusts
 * the RPC for authorization and tenant isolation; it does not broaden access.
 */
export function GuardianLiveTripsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const trips = await fetchGuardianLiveTrips();
      setState({ kind: 'ready', trips });
      setLastRefreshedAt(new Date().toISOString());
    } catch {
      setState({ kind: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={guardianNavItems}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Bus Status"
          title="Live Bus Status"
          description="See current trip status for your linked students."
        />

        <Card className="p-4">
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
            <span
              className="text-sm text-gray-600"
              data-testid="guardian-live-last-refreshed"
            >
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="guardian-live-loading">
            <DataState
              title="Loading live bus status"
              message="Fetching safe trip status for your linked students."
            />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-live-error">
            <DataState
              title="We could not load live trip status right now."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.trips.length === 0 && (
          <div data-testid="guardian-live-empty">
            <DataState
              title="No linked student trip status is available yet."
              message="If your child has a route assignment, status will appear here."
            />
          </div>
        )}

        {state.kind === 'ready' && state.trips.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-live-list">
            {state.trips.map((trip) => {
              const stale = isStale(trip.lastLocationRecordedAt);
              return (
                <Card
                  key={`${trip.studentId}-${trip.routeName}`}
                  className="p-5"
                  data-testid="guardian-live-student-card"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-navy-900">
                        {trip.studentName}
                      </h2>
                      {trip.routeName && (
                        <p className="mt-1 text-base text-gray-700">
                          Route: <span className="font-semibold">{trip.routeName}</span>
                        </p>
                      )}
                    </div>
                    {trip.hasActiveTrip ? (
                      <StatusPill tone="success">Trip in progress</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">No active trip right now</StatusPill>
                    )}
                  </div>

                  {trip.hasActiveTrip && (
                    <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm">
                      {trip.tripStatus && (
                        <p className="text-gray-600">
                          Status:{' '}
                          <span className="font-semibold text-navy-900">
                            {trip.tripStatus}
                          </span>
                        </p>
                      )}
                      {trip.lastLocationRecordedAt && (
                        <p className="text-gray-600">
                          Last updated:{' '}
                          <span className="font-semibold text-navy-900">
                            {formatTimestamp(trip.lastLocationRecordedAt)}
                          </span>
                        </p>
                      )}
                      {stale && (
                        <p
                          className="text-sm text-warning-700"
                          data-testid="guardian-live-stale-warning"
                        >
                          Status may be delayed.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
