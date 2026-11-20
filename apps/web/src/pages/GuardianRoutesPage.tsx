import { BusFront, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  GuardianRefresh,
  GuardianRefreshMenu,
  GuardianLoading,
} from '@/components/guardian/GuardianRefresh';
import { useGuardianHomeData } from '@/hooks/useGuardianHomeData';
import { groupGuardianBuses, guardianBusDetailsPath } from '@/utils/guardianBusGroups';

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
  const { state: verified, refreshing, lastRefreshedAt, refresh: load } = useGuardianHomeData();
  const state =
    verified.kind === 'ready'
      ? { kind: 'ready' as const, locations: verified.data.buses, stops: verified.data.stops }
      : verified;

  const busGroups = state.kind === 'ready' ? groupGuardianBuses(state.locations) : [];

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={[]}
      navGroups={guardianNavGroups}
      nativeHeaderActions={<GuardianRefreshMenu refreshing={refreshing} refresh={load} />}
    >
      <GuardianRefresh
        enabled={appSurface === 'native-mobile'}
        refreshing={refreshing}
        refresh={load}
      >
        <PageHeader
          eyebrow="Assigned buses"
          title="My Buses"
          description={
            appSurface === 'web'
              ? "See each linked student's assigned bus and its current service status."
              : undefined
          }
        />

        {appSurface === 'web' && (
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
        )}

        {state.kind === 'loading' &&
          (appSurface === 'native-mobile' ? (
            <GuardianLoading label="Loading assignments…" />
          ) : (
            <DataState
              title="Loading bus information"
              message="Fetching the buses assigned to your linked students."
            />
          ))}
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
        {state.kind === 'ready' && state.locations.length === 0 && (
          <div data-testid="guardian-routes-empty">
            <DataState
              title="No linked students are available yet."
              message="Please contact your school transportation office."
            />
          </div>
        )}
        {state.kind === 'ready' && appSurface === 'native-mobile' && busGroups.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-routes-list">
            {busGroups.map((group) => (
              <Card
                key={group.key}
                className="p-5"
                data-testid="guardian-student-bus-card"
                data-ui="guardian-bus-card"
              >
                {group.busNumber ? (
                  <Link
                    to={guardianBusDetailsPath(group.busNumber)}
                    className="guardian-bus-summary"
                    data-testid="guardian-bus-details-link"
                  >
                    <span className="sr-only">View details for </span>
                    <BusFront aria-hidden className="h-8 w-8 shrink-0" />
                    <h2 className="min-w-0 flex-1 text-2xl font-bold">Bus {group.busNumber}</h2>
                    <StatusPill tone="success">Assigned</StatusPill>
                    <ChevronRight aria-hidden className="h-6 w-6 shrink-0" />
                  </Link>
                ) : (
                  <h2 className="text-xl font-bold">
                    {group.visibility.assignmentState === 'unavailable'
                      ? 'Bus information unavailable'
                      : 'No bus assigned yet'}
                  </h2>
                )}
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  <h3 className="text-lg font-bold">Your children</h3>
                  <ul
                    aria-label="Your children"
                    className="mt-4 divide-y divide-[var(--color-border)]"
                  >
                    {group.students.map((student) => {
                      const assignments =
                        state.stops?.filter(
                          (stop) =>
                            stop.studentId === student.studentId &&
                            stop.busNumber === student.busNumber,
                        ) ?? [];
                      return (
                        <li
                          key={student.studentId}
                          data-testid="guardian-assigned-student"
                          className="guardian-assignment-student"
                        >
                          <h4 className="text-lg font-bold">{student.studentName}</h4>
                          {student.studentGrade && (
                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                              {formatGrade(student.studentGrade)}
                            </p>
                          )}
                          {state.stops === null ? (
                            <div className="mt-3 space-y-2">
                              <p role="status" className="text-sm">
                                Stop information is unavailable right now.
                              </p>
                              <Button variant="secondary" onClick={load} disabled={refreshing}>
                                Try again
                              </Button>
                            </div>
                          ) : assignments.length > 0 ? (
                            <div className="divide-y divide-[var(--color-border)]">
                              {assignments.map((stop, index) => (
                                <div
                                  key={`${stop.direction}:${stop.tripName}:${index}`}
                                  className="guardian-assignment-journey"
                                >
                                  {assignments.length > 1 && (
                                    <h5 className="mb-3 font-semibold">{stop.tripName}</h5>
                                  )}
                                  <dl className="guardian-assignment-details">
                                    {assignments.length === 1 && (
                                      <>
                                        <dt>Journey</dt>
                                        <dd>{stop.tripName}</dd>
                                      </>
                                    )}
                                    <dt>Pickup</dt>
                                    <dd>{stop.pickupStopName ?? 'Not assigned'}</dd>
                                    <dt>Drop-off</dt>
                                    <dd>{stop.dropoffStopName ?? 'Not assigned'}</dd>
                                    <dt>Seat</dt>
                                    <dd>{stop.seatNumber ?? 'Not assigned'}</dd>
                                  </dl>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                              {group.busNumber
                                ? 'No journey details are available yet.'
                                : 'Contact your school transportation office.'}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Card>
            ))}
          </section>
        )}

        {state.kind === 'ready' && appSurface === 'web' && state.locations.length > 0 && (
          <section className="grid gap-4" data-testid="guardian-routes-list">
            {state.locations.map((bus) => (
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
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        License plate
                      </p>
                      <p className="mt-1 text-lg font-semibold text-navy-900">
                        {bus.licensePlate ?? 'Not available'}
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
      </GuardianRefresh>
    </DashboardLayout>
  );
}
