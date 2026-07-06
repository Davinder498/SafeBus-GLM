import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianStudentRoutes } from '@/services/guardianRouteVisibilityService';
import { studentDisplayName, type GuardianStudentRoute } from '@/types/guardianRouteVisibility';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; routes: GuardianStudentRoute[] };

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
      const routes = await fetchGuardianStudentRoutes();
      setState({ kind: 'ready', routes });
      setLastRefreshedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'We could not load your student route information. Please try again.';
      setState({ kind: 'error', message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Parent Dashboard" portal="parent" navItems={['Bus Status', 'My Students & Routes']}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="My Students"
          title="My Students & Routes"
          description="View your linked students and their assigned route information."
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
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <span className="text-sm text-gray-600" data-testid="guardian-routes-last-refreshed">
              {lastRefreshedAt ? `Last refreshed ${formatTimestamp(lastRefreshedAt)}` : 'Not refreshed yet'}
            </span>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <DataState title="Loading your student route information" message="Fetching your linked students and route assignments." />
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="guardian-routes-error">
            <DataState title="We could not load your student route information." message="Please try again." />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.routes.length === 0 && (
          <div data-testid="guardian-routes-empty">
            <DataState
              title="No student route assignments are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}

        {state.kind === 'ready' && state.routes.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-routes-list">
            {state.routes.map((route) => (
              <Card key={route.studentId} className="p-5" data-testid="guardian-student-route-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {studentDisplayName(route)}
                    </h2>
                    {route.studentGrade && (
                      <p className="mt-1 text-sm text-gray-600">
                        Grade {route.studentGrade}
                      </p>
                    )}
                    {route.routeName ? (
                      <p className="mt-2 text-base text-gray-700">
                        Route: <span className="font-semibold">{route.routeName}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">
                        No route assigned yet.
                      </p>
                    )}
                  </div>
                  {route.assignmentStatus && (
                    <StatusPill tone={route.assignmentStatus === 'active' ? 'success' : 'neutral'}>
                      {route.assignmentStatus}
                    </StatusPill>
                  )}
                </div>
                {(route.pickupStopName || route.dropoffStopName) && (
                  <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 text-sm sm:grid-cols-2">
                    {route.pickupStopName && (
                      <p className="text-gray-600">
                        Pickup: <span className="font-semibold text-navy-900">{route.pickupStopName}</span>
                      </p>
                    )}
                    {route.dropoffStopName && (
                      <p className="text-gray-600">
                        Drop-off: <span className="font-semibold text-navy-900">{route.dropoffStopName}</span>
                      </p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
