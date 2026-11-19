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
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Guardian home"
          title={appSurface === 'native-mobile' ? 'Home' : 'My Buses'}
          description={
            appSurface === 'web'
              ? 'Track the assigned bus during an active school run. Route and operational details stay with the transportation team.'
              : undefined
          }
        />

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

        {state.kind === 'loading' && (
          <DataState
            title="Loading your buses"
            message="Fetching bus information for your linked students."
          />
        )}
        {state.kind === 'error' && (
          <DataState
            title="We could not load your buses."
            message="Bus status is unavailable. Check your connection and try Refresh."
          />
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-bold">
                    {group.busNumber ? `Bus ${group.busNumber}` : 'No bus assigned yet'}
                  </h2>
                  <StatusPill tone={status.tone} dot pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </div>
                {group.visibility.locationRecordedAt && (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                    Last location update{' '}
                    {new Date(group.visibility.locationRecordedAt).toLocaleTimeString()}
                  </p>
                )}
                {group.busNumber && (
                  <div className="mt-4 flex flex-col gap-2">
                    {group.hasActiveTrip && (
                      <Link
                        className={actionLinkClass}
                        to={`/guardian/live-map?bus=${encodeURIComponent(group.busNumber)}`}
                      >
                        View live map
                      </Link>
                    )}
                    <Link
                      className="inline-flex min-h-12 items-center font-semibold underline"
                      aria-label={`View bus details for Bus ${group.busNumber}`}
                      to={guardianBusDetailsPath(group.busNumber)}
                    >
                      View bus details
                    </Link>
                  </div>
                )}
                <ul className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                  {group.students.map((student) => (
                    <li
                      key={student.studentId}
                      data-testid="guardian-home-student-card"
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <span className="font-semibold">
                        {student.studentName}
                        <span className="sr-only">
                          {group.busNumber ? ` Bus ${group.busNumber}` : 'No bus assigned'}
                        </span>
                      </span>
                      <span className="text-sm">
                        {
                          {
                            no_active_trip: 'No active trip',
                            not_picked_up: 'Not picked up',
                            picked_up: 'Picked up',
                            dropped_off: 'Dropped off',
                          }[student.studentTripStatus]
                        }
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  className="inline-flex min-h-12 items-center font-semibold underline"
                  to="/guardian/events"
                >
                  Pickup &amp; drop-off status
                </Link>
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
      </div>
    </DashboardLayout>
  );
}
