import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import type {
  GuardianBusVisibility,
  GuardianStudentTripStatus,
} from '@/types/guardianLiveBusLocation';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; buses: GuardianBusVisibility[] };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status: GuardianStudentTripStatus): string {
  if (status === 'not_picked_up') return 'Not picked up';
  if (status === 'picked_up') return 'Picked up';
  if (status === 'dropped_off') return 'Dropped off';
  return 'No active bus run';
}

function statusTone(status: GuardianStudentTripStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'picked_up' || status === 'dropped_off') return 'success';
  if (status === 'not_picked_up') return 'warning';
  return 'neutral';
}

export function GuardianTripEventsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setState({ kind: 'ready', buses: await fetchGuardianBusVisibility() });
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
      navItems={[]}
      navGroups={guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Pickup & drop-off"
          title="Pickup & Drop-off Status"
          description="See the latest status recorded during the active school bus run."
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
            <span className="text-sm text-gray-600" data-testid="guardian-events-last-refreshed">
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="guardian-events-loading">
            <DataState
              title="Loading pickup and drop-off status"
              message="Checking the active bus run."
            />
          </div>
        )}
        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-events-error">
            <DataState
              title="We could not load pickup and drop-off status."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {state.kind === 'ready' && state.buses.length === 0 && (
          <div data-testid="guardian-events-empty">
            <DataState
              title="No linked students are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}
        {state.kind === 'ready' && state.buses.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-events-list">
            {state.buses.map((bus) => (
              <Card key={bus.studentId} className="p-5" data-testid="guardian-events-student-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{bus.studentName}</h2>
                    {bus.busNumber && (
                      <p className="mt-1 text-sm text-gray-600">
                        Bus <span className="font-semibold text-navy-900">{bus.busNumber}</span> ·
                        Plate {bus.licensePlate ?? 'not available'}
                      </p>
                    )}
                  </div>
                  <StatusPill tone={statusTone(bus.studentTripStatus)}>
                    {statusLabel(bus.studentTripStatus)}
                  </StatusPill>
                </div>

                <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 text-sm sm:grid-cols-2">
                  {bus.studentTripStatus === 'no_active_trip' && (
                    <p className="text-gray-600" data-testid="guardian-events-no-active-trip">
                      No active school bus run right now.
                    </p>
                  )}
                  {bus.pickupEventTime && (
                    <p className="text-gray-600">
                      Pickup time:{' '}
                      <span className="font-semibold text-navy-900">
                        {formatTimestamp(bus.pickupEventTime)}
                      </span>
                    </p>
                  )}
                  {bus.dropoffEventTime && (
                    <p className="text-gray-600">
                      Drop-off time:{' '}
                      <span className="font-semibold text-navy-900">
                        {formatTimestamp(bus.dropoffEventTime)}
                      </span>
                    </p>
                  )}
                  {bus.lastEventTime && (
                    <p className="text-gray-600">
                      Last updated:{' '}
                      <span className="font-semibold text-navy-900">
                        {formatTimestamp(bus.lastEventTime)}
                      </span>
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
