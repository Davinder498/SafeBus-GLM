import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, type DashboardNavItem } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianTripEventStatuses } from '@/services/guardianTripEventService';
import type {
  GuardianStudentTripStatus,
  GuardianTripEventStatus,
} from '@/types/guardianTripEvent';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; statuses: GuardianTripEventStatus[] };

const guardianNavItems: DashboardNavItem[] = [
  { label: 'Bus Status', to: '/guardian/live' },
  { label: 'Pickup & Drop-off', to: '/guardian/events' },
  { label: 'My Students & Routes', to: '/guardian/routes' },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status: GuardianStudentTripStatus): string {
  switch (status) {
    case 'not_picked_up':
      return 'Not picked up';
    case 'picked_up':
      return 'Picked up';
    case 'dropped_off':
      return 'Dropped off';
    case 'no_active_trip':
      return 'No active trip right now';
  }
}

function statusTone(status: GuardianStudentTripStatus): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'picked_up':
    case 'dropped_off':
      return 'success';
    case 'not_picked_up':
      return 'warning';
    case 'no_active_trip':
      return 'neutral';
  }
}

function StatusDetails({ status }: { status: GuardianTripEventStatus }) {
  if (status.studentTripStatus === 'no_active_trip') {
    return (
      <p className="text-sm text-gray-600" data-testid="guardian-events-no-active-trip">
        No active trip right now.
      </p>
    );
  }

  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      {status.pickupStopName && (
        <p className="text-gray-600">
          Pickup stop:{' '}
          <span className="font-semibold text-navy-900">{status.pickupStopName}</span>
        </p>
      )}
      {status.dropoffStopName && (
        <p className="text-gray-600">
          Drop-off stop:{' '}
          <span className="font-semibold text-navy-900">{status.dropoffStopName}</span>
        </p>
      )}
      {status.pickupEventTime && (
        <p className="text-gray-600">
          Pickup time:{' '}
          <span className="font-semibold text-navy-900">
            {formatTimestamp(status.pickupEventTime)}
          </span>
        </p>
      )}
      {status.dropoffEventTime && (
        <p className="text-gray-600">
          Drop-off time:{' '}
          <span className="font-semibold text-navy-900">
            {formatTimestamp(status.dropoffEventTime)}
          </span>
        </p>
      )}
      {status.lastEventTime && (
        <p className="text-gray-600">
          Last updated:{' '}
          <span className="font-semibold text-navy-900">
            {formatTimestamp(status.lastEventTime)}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Guardian pickup/drop-off status page (Milestone 8B).
 *
 * Shows safe, text-only event status for the guardian's linked students by
 * calling the secure get_guardian_student_trip_event_visibility() RPC from
 * Milestone 8A. This page is read-only and deliberately excludes notifications,
 * realtime subscriptions, maps, GPS coordinates, speed, ETA, QR, driver contact
 * details, internal ids, and event writes.
 */
export function GuardianTripEventsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const statuses = await fetchGuardianTripEventStatuses();
      setState({ kind: 'ready', statuses });
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
          eyebrow="Pickup & Drop-off"
          title="Pickup & Drop-off Status"
          description="See pickup and drop-off status for your linked students."
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              disabled={refreshing}
              data-testid="guardian-events-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <span
              className="text-sm text-gray-600"
              data-testid="guardian-events-last-refreshed"
            >
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="guardian-events-loading">
            <DataState
              title="Loading student trip status"
              message="Fetching pickup and drop-off status for your linked students."
            />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-events-error">
            <DataState
              title="We could not load student trip status right now."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.statuses.length === 0 && (
          <div data-testid="guardian-events-empty">
            <DataState
              title="No student trip status is available yet."
              message="Status will appear here when pickup or drop-off details are available."
            />
          </div>
        )}

        {state.kind === 'ready' && state.statuses.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-events-list">
            {state.statuses.map((status) => (
              <Card
                key={`${status.studentId}-${status.routeName ?? 'route'}`}
                className="p-5"
                data-testid="guardian-events-student-card"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {status.studentDisplayName}
                    </h2>
                    {status.routeName && (
                      <p className="mt-1 text-base text-gray-700">
                        Route: <span className="font-semibold">{status.routeName}</span>
                      </p>
                    )}
                  </div>
                  <StatusPill tone={statusTone(status.studentTripStatus)}>
                    {statusLabel(status.studentTripStatus)}
                  </StatusPill>
                </div>

                <div className="mt-4 border-t border-gray-200 pt-4">
                  <StatusDetails status={status} />
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
