import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; buses: GuardianBusVisibility[] };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function GuardianRoutesPage() {
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
          eyebrow="Assigned buses"
          title="My Buses"
          description="See each linked student's stable bus number and the plate of the physical vehicle currently assigned to it."
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              disabled={refreshing}
              data-testid="guardian-routes-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <span className="text-sm text-gray-600" data-testid="guardian-routes-last-refreshed">
              {lastRefreshedAt
                ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}`
                : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <DataState
            title="Loading bus information"
            message="Fetching the buses assigned to your linked students."
          />
        )}
        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-routes-error">
            <DataState
              title="We could not load your bus information."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {state.kind === 'ready' && state.buses.length === 0 && (
          <div data-testid="guardian-routes-empty">
            <DataState
              title="No linked students are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}
        {state.kind === 'ready' && state.buses.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-routes-list">
            {state.buses.map((bus) => (
              <Card key={bus.studentId} className="p-5" data-testid="guardian-student-bus-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{bus.studentName}</h2>
                    {bus.studentGrade && (
                      <p className="mt-1 text-sm text-gray-600">Grade {bus.studentGrade}</p>
                    )}
                  </div>
                  <StatusPill tone={bus.hasActiveTrip ? 'success' : 'neutral'}>
                    {bus.hasActiveTrip ? 'School run active' : 'Not active right now'}
                  </StatusPill>
                </div>

                {bus.assignmentState === 'assigned' && bus.busNumber ? (
                  <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Bus number
                      </p>
                      <p className="mt-1 text-2xl font-bold text-navy-900">{bus.busNumber}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        This service number stays the same.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        License plate
                      </p>
                      <p className="mt-1 text-lg font-semibold text-navy-900">
                        {bus.licensePlate ?? 'Not available'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        This may change when the physical vehicle changes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-600">
                    {bus.assignmentState === 'unavailable'
                      ? 'Bus information is temporarily unavailable.'
                      : 'No bus is assigned yet.'}
                  </p>
                )}
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
