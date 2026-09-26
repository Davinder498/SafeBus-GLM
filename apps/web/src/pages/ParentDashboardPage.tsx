import { useEffect, useState } from 'react';
import { BusFront, ChevronRight, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import {
  fetchGuardianStudentStops,
  type GuardianStudentStopAssignment,
} from '@/services/guardianStudentStopsService';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';
import {
  groupGuardianBuses,
  guardianBusDetailsPath,
  guardianBusStatus,
} from '@/utils/guardianBusGroups';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      buses: GuardianBusVisibility[];
      stops: GuardianStudentStopAssignment[] | null;
    };

const actionLinkClass =
  'inline-flex rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800';

export function ParentDashboardPage() {
  const appSurface = useAppSurface();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchGuardianBusVisibility(),
      appSurface === 'native-mobile'
        ? fetchGuardianStudentStops().catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([buses, stops]) => {
        if (active) setState({ kind: 'ready', buses, stops });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [appSurface]);

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
          title="My Buses"
          description={
            appSurface === 'web'
              ? 'Track the assigned bus during an active school run. Route and operational details stay with the transportation team.'
              : undefined
          }
        />

        {state.kind === 'loading' && (
          <DataState
            title="Loading your buses"
            message="Fetching bus information for your linked students."
          />
        )}
        {state.kind === 'error' && (
          <DataState
            title="We could not load your buses."
            message="Please refresh the page and try again."
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
            const content = (
              <Card
                className="p-5"
                data-testid="guardian-home-bus-card"
                data-ui="guardian-bus-card"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-navy-700 shadow-sm">
                      <BusFront className="h-6 w-6" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                        Assigned bus
                      </p>
                      <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">
                        {group.busNumber ? `Bus ${group.busNumber}` : 'No bus assigned yet'}
                      </h2>
                    </div>
                  </div>
                  <StatusPill tone={status.tone} dot pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </div>

                <div className="mt-4 rounded-2xl bg-white/70 p-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <Users className="h-4 w-4" aria-hidden /> Assigned students
                  </p>
                  <p className="mt-1 font-semibold text-navy-900">
                    {group.students.map((student) => student.studentName).join(', ')}
                  </p>
                </div>

                {group.busNumber ? (
                  <div className="mt-4 flex items-center justify-between border-t border-amber-200/80 pt-4 text-sm font-bold text-navy-700">
                    <span>View bus details</span>
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </div>
                ) : (
                  <p className="mt-4 border-t border-amber-200/80 pt-4 text-sm text-gray-600">
                    Bus information is not available yet.
                  </p>
                )}
              </Card>
            );

            return group.busNumber ? (
              <Link
                key={group.key}
                to={guardianBusDetailsPath(group.busNumber)}
                className="block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                aria-label={`View details for Bus ${group.busNumber}`}
                data-testid="guardian-home-bus-link"
              >
                {content}
              </Link>
            ) : (
              <div key={group.key}>{content}</div>
            );
          })}

        {state.kind === 'ready' && appSurface === 'native-mobile' && state.buses.length > 0 && (
          <section
            aria-labelledby="my-kids-heading"
            data-testid="guardian-home-my-kids"
            className="space-y-3"
          >
            <h2 id="my-kids-heading" className="text-xl font-bold text-navy-900">
              My Kids
            </h2>
            {state.buses.map((student) => {
              const assignments =
                state.stops?.filter(
                  (stop) =>
                    stop.studentId === student.studentId && stop.busNumber === student.busNumber,
                ) ?? [];
              return (
                <Card
                  key={student.studentId}
                  className="p-5"
                  data-testid="guardian-home-student-card"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                      <Users className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-navy-900">{student.studentName}</h3>
                      {student.studentGrade && (
                        <p className="text-sm text-gray-600">{student.studentGrade}</p>
                      )}
                      <p className="mt-1 font-semibold text-navy-700">
                        {student.busNumber ? `Bus ${student.busNumber}` : 'No bus assigned yet'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                      <MapPin className="h-4 w-4" aria-hidden /> Stop information
                    </p>
                    {state.stops === null ? (
                      <p className="mt-2 text-sm text-gray-600">
                        Stop information is unavailable right now.
                      </p>
                    ) : assignments.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-600">No stops assigned yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {assignments.map((assignment, index) => (
                          <li
                            key={`${assignment.direction}:${assignment.tripName}:${index}`}
                            className="rounded-xl bg-slate-50 p-3 text-sm"
                          >
                            <p className="font-bold text-navy-900">{assignment.tripName}</p>
                            <p className="mt-1 text-gray-600">
                              Pickup: {assignment.pickupStopName ?? 'Not assigned'}
                            </p>
                            <p className="text-gray-600">
                              Drop-off: {assignment.dropoffStopName ?? 'Not assigned'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </section>
        )}

        {state.kind === 'ready' &&
          appSurface === 'web' &&
          state.buses.map((bus) => (
            <Card key={bus.studentId} className="p-5" data-testid="guardian-home-bus-card">
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
              <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                <Link to="/guardian/live-map" className={actionLinkClass}>
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

        {appSurface === 'web' && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Bus number and license plate</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              The bus number is the student's stable service number. The license plate identifies
              the physical vehicle and can change when transportation assigns another vehicle to
              that service.
            </p>
            <Link to="/guardian/routes" className={`${actionLinkClass} mt-4`}>
              View all assigned buses
            </Link>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
