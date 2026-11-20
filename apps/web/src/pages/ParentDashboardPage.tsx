import { BusFront, ChevronRight, UserRound } from 'lucide-react';
import {
  GuardianRefresh,
  GuardianRefreshMenu,
  GuardianLoading,
} from '@/components/guardian/GuardianRefresh';
import { seatLabel } from '@/utils/studentSeat';
import { Link } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useGuardianHomeData } from '@/hooks/useGuardianHomeData';
import { Button } from '@/components/ui/Button';
import {
  groupGuardianBuses,
  guardianBusDetailsPath,
  guardianBusStatus,
} from '@/utils/guardianBusGroups';

const actionLinkClass =
  'inline-flex rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800';

function formatLocationAge(recordedAt: string): string {
  const time = new Date(recordedAt).getTime();
  if (!Number.isFinite(time)) return 'time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ParentDashboardPage() {
  const appSurface = useAppSurface();
  const { state: verified, refreshing, lastRefreshedAt, refresh } = useGuardianHomeData();
  const state = verified.kind === 'ready' ? { kind: 'ready' as const, ...verified.data } : verified;

  const busGroups = state.kind === 'ready' ? groupGuardianBuses(state.buses) : [];

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={[]}
      navGroups={guardianNavGroups}
      nativeHeaderActions={<GuardianRefreshMenu refreshing={refreshing} refresh={refresh} />}
    >
      <GuardianRefresh
        enabled={appSurface === 'native-mobile'}
        refreshing={refreshing}
        refresh={refresh}
      >
        <PageHeader
          eyebrow="Guardian home"
          title={appSurface === 'native-mobile' ? 'Home' : 'My Buses'}
          description={
            appSurface === 'web'
              ? 'Track the assigned bus during an active school run. Route and operational details stay with the transportation team.'
              : undefined
          }
        />

        {appSurface === 'web' && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <span role="status" data-testid="guardian-home-last-checked">
              {lastRefreshedAt
                ? `Last checked ${new Date(lastRefreshedAt).toLocaleTimeString()}`
                : 'Not checked yet'}
            </span>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        )}

        {state.kind === 'loading' &&
          (appSurface === 'native-mobile' ? (
            <GuardianLoading label="Loading your buses…" />
          ) : (
            <DataState
              title="Loading your buses"
              message="Fetching bus information for your linked students."
            />
          ))}
        {state.kind === 'error' && (
          <div className="space-y-3">
            <DataState
              title="We could not load your buses."
              message="Bus status is unavailable. Check your connection and try again."
            />
            <Button onClick={refresh} disabled={refreshing}>
              Try again
            </Button>
          </div>
        )}
        {state.kind === 'ready' && state.buses.length === 0 && (
          <DataState
            title="No linked students are available yet."
            message="Please contact your school transportation office."
          />
        )}

        {state.kind === 'ready' &&
          appSurface === 'native-mobile' &&
          busGroups.map((group) => {
            const status = guardianBusStatus(group);
            return (
              <Card
                key={group.key}
                className="p-5"
                data-testid="guardian-home-bus-card"
                data-ui="guardian-bus-card"
              >
                {(() => {
                  const heading = (
                    <>
                      <BusFront aria-hidden className="h-8 w-8 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-bold">
                            {group.busNumber
                              ? `Bus ${group.busNumber}`
                              : group.visibility.assignmentState === 'unavailable'
                                ? 'Bus information unavailable'
                                : 'No bus assigned yet'}
                          </h2>
                          <StatusPill tone={status.tone} dot pulse={status.pulse}>
                            {status.label === 'Delayed' ? 'Location delayed' : status.label}
                          </StatusPill>
                        </div>
                        {group.visibility.locationRecordedAt && (
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                            {group.visibility.locationState === 'fresh'
                              ? 'Location updated'
                              : 'Last location received'}{' '}
                            {formatLocationAge(group.visibility.locationRecordedAt)}
                          </p>
                        )}
                      </div>
                      {group.busNumber && <ChevronRight aria-hidden className="h-6 w-6 shrink-0" />}
                    </>
                  );
                  return group.busNumber ? (
                    <Link
                      to={guardianBusDetailsPath(group.busNumber)}
                      className="guardian-bus-summary"
                    >
                      <span className="sr-only">View bus details for </span>
                      {heading}
                    </Link>
                  ) : (
                    <div className="guardian-bus-summary">{heading}</div>
                  );
                })()}
                {group.hasActiveTrip && (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                    {group.visibility.locationState === 'fresh' ? (
                      <Link
                        className={`${actionLinkClass} flex min-h-12 w-full items-center justify-center`}
                        to={`/guardian/live-map?bus=${encodeURIComponent(group.busNumber ?? '')}`}
                      >
                        View live map
                      </Link>
                    ) : (
                      <>
                        <Button disabled className="guardian-map-unavailable w-full">
                          Location unavailable
                        </Button>
                        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                          {group.visibility.locationState === 'stale'
                            ? 'The bus location may have changed.'
                            : 'Waiting for a verified bus location.'}
                        </p>
                      </>
                    )}
                  </div>
                )}
                <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                  <h3 className="text-lg font-bold">Your children</h3>
                  <ul className="mt-2 divide-y divide-[var(--color-border)]">
                    {group.students.map((student) => (
                      <li key={student.studentId} data-testid="guardian-home-student-card">
                        <Link
                          className="guardian-child-status"
                          to={`/guardian/events?student=${encodeURIComponent(student.studentId)}`}
                        >
                          <span className="sr-only">Pickup and drop-off status for </span>
                          <UserRound aria-hidden className="h-6 w-6 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{student.studentName}</span>
                            <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
                              {
                                {
                                  no_active_trip: 'No active trip',
                                  not_picked_up: 'Not picked up',
                                  picked_up: 'Picked up',
                                  dropped_off: 'Dropped off',
                                }[student.studentTripStatus]
                              }
                            </span>
                          </span>
                          <ChevronRight aria-hidden className="h-5 w-5 shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            );
          })}

        {state.kind === 'ready' &&
          appSurface === 'web' &&
          state.buses.map((bus) => (
            <Card
              key={bus.studentId}
              className="rounded-2xl border-[var(--color-border)] p-5 shadow-sm sm:p-6"
              data-testid="guardian-home-bus-card"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-500">{bus.studentName}</p>
                  {bus.busNumber ? (
                    <>
                      <h2 className="mt-1 text-3xl font-bold text-navy-900">Bus {bus.busNumber}</h2>
                      <p className="mt-2 text-gray-600">
                        License plate:{' '}
                        <span className="font-semibold text-navy-900">
                          {bus.licensePlate ?? 'Not available'}
                        </span>
                      </p>
                    </>
                  ) : (
                    <h2 className="mt-1 text-xl font-bold text-navy-900">No bus assigned yet</h2>
                  )}
                </div>
                <StatusPill tone={bus.hasActiveTrip ? 'success' : 'neutral'}>
                  {bus.hasActiveTrip ? 'School run active' : 'Not active right now'}
                </StatusPill>
              </div>
              <div className="mt-4 text-sm text-gray-700">
                {state.stops === null ? (
                  <p>Seat information is unavailable right now.</p>
                ) : (
                  state.stops
                    .filter(
                      (assignment) =>
                        assignment.studentId === bus.studentId &&
                        assignment.busNumber === bus.busNumber,
                    )
                    .map((assignment, index) => (
                      <p key={index}>
                        {assignment.tripName}: {seatLabel(assignment.seatNumber)}
                      </p>
                    ))
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                <Link
                  to={`/guardian/live-map?bus=${encodeURIComponent(bus.busNumber ?? '')}`}
                  className={actionLinkClass}
                >
                  View live map
                </Link>
                <Link to="/guardian/live" className={actionLinkClass}>
                  View bus status
                </Link>
                <Link to="/guardian/events" className={actionLinkClass}>
                  Pickup & drop-off
                </Link>
                <Link to="/guardian/notifications" className={actionLinkClass}>
                  Email choices
                </Link>
              </div>
            </Card>
          ))}
      </GuardianRefresh>
    </DashboardLayout>
  );
}
