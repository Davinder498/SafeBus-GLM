import { useEffect, useState } from 'react';
import { BusFront, ChevronRight, Users } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';
import { groupGuardianBuses, guardianBusDetailsPath } from '@/utils/guardianBusGroups';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; buses: GuardianBusVisibility[] };

const actionLinkClass =
  'inline-flex rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800';

export function ParentDashboardPage() {
  const appSurface = useAppSurface();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    fetchGuardianBusVisibility()
      .then((buses) => {
        if (active) setState({ kind: 'ready', buses });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

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
          busGroups.map((group) => (
            <Card
              key={group.key}
              className="p-5"
              data-testid="guardian-home-bus-card"
              data-ui="guardian-bus-card"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-navy-700 shadow-sm">
                    <BusFront className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                      Assigned bus
                    </p>
                    {group.busNumber ? (
                    <>
                        <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">
                          Bus {group.busNumber}
                        </h2>
                      <p className="mt-2 text-gray-600">
                        License plate:{' '}
                        <span className="font-semibold text-navy-900">
                            {group.licensePlate ?? 'Not available'}
                        </span>
                      </p>
                    </>
                  ) : (
                    <h2 className="mt-1 text-xl font-bold text-navy-900">No bus assigned yet</h2>
                  )}
                  </div>
                </div>
                <StatusPill tone={group.hasActiveTrip ? 'success' : 'neutral'} dot>
                  {group.hasActiveTrip ? 'Active' : 'Inactive'}
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

              <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                {group.busNumber && (
                  <Link
                    to={guardianBusDetailsPath(group.busNumber)}
                    className={`${actionLinkClass} justify-between`}
                  >
                    Bus details <ChevronRight className="h-5 w-5" aria-hidden />
                  </Link>
                )}
                <Link
                  to={
                    group.busNumber
                      ? `/guardian/live-map?bus=${encodeURIComponent(group.busNumber)}`
                      : '/guardian/live-map'
                  }
                  className={actionLinkClass}
                >
                  View live map
                </Link>
              </div>
            </Card>
          ))}

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

        {appSurface === 'web' && <Card className="p-5">
          <h2 className="text-lg font-bold text-navy-900">Bus number and license plate</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            The bus number is the student's stable service number. The license plate identifies the
            physical vehicle and can change when transportation assigns another vehicle to that
            service.
          </p>
          <Link to="/guardian/routes" className={`${actionLinkClass} mt-4`}>
            View all assigned buses
          </Link>
        </Card>}
      </div>
    </DashboardLayout>
  );
}
