import { useCallback, useEffect, useState } from 'react';
import { BusFront, ChevronRight, Users } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';
import { groupGuardianBuses, guardianBusDetailsPath } from '@/utils/guardianBusGroups';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; buses: GuardianBusVisibility[] };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatGrade(grade: string): string {
  return /^grade\s/i.test(grade) ? grade : `Grade ${grade}`;
}

export function GuardianRoutesPage() {
  const appSurface = useAppSurface();
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

  const busGroups = state.kind === 'ready' ? groupGuardianBuses(state.buses) : [];

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

        <Card className="p-4" data-ui="manual-refresh-card">
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
        {state.kind === 'ready' && appSurface === 'native-mobile' && busGroups.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-routes-list">
            {busGroups.map((group) => {
              const content = (
                <Card
                  className="p-5"
                  data-testid="guardian-student-bus-card"
                  data-ui="guardian-bus-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
                        <BusFront className="h-6 w-6" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                          Assigned bus
                        </p>
                        <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">
                          {group.busNumber ? `Bus ${group.busNumber}` : 'Not assigned'}
                        </h2>
                      </div>
                    </div>
                    <StatusPill tone={group.hasActiveTrip ? 'success' : 'neutral'} dot>
                      {group.hasActiveTrip ? 'Active' : 'Inactive'}
                    </StatusPill>
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        License plate
                      </p>
                      <p className="mt-1 text-base font-bold text-navy-900">
                        {group.licensePlate ?? 'Not available'}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <Users className="h-4 w-4" aria-hidden /> Assigned students
                      </p>
                      <ul className="mt-2 space-y-1" aria-label="Assigned students">
                        {group.students.map((student) => (
                          <li key={student.studentId} className="font-semibold text-navy-900">
                            {student.studentName}
                            {student.studentGrade ? (
                              <span className="font-normal text-gray-500">
                                {' '}· {formatGrade(student.studentGrade)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {group.busNumber ? (
                    <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4 text-sm font-bold text-navy-700">
                      <span>View bus details</span>
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    </div>
                  ) : (
                    <p className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-600">
                      Bus information is not available yet.
                    </p>
                  )}
                </Card>
              );

              return group.busNumber ? (
                <Link
                  key={group.key}
                  to={guardianBusDetailsPath(group.busNumber)}
                  className="block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                  aria-label={`View details for Bus ${group.busNumber}`}
                  data-testid="guardian-bus-details-link"
                >
                  {content}
                </Link>
              ) : (
                <div key={group.key}>{content}</div>
              );
            })}
          </section>
        )}

        {state.kind === 'ready' && appSurface === 'web' && state.buses.length > 0 && (
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
                      <p className="mt-1 text-xs text-gray-500">This service number stays the same.</p>
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
