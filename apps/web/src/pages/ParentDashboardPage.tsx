import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; buses: GuardianBusVisibility[] };

const actionLinkClass =
  'inline-flex rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800';

export function ParentDashboardPage() {
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
          description="Track the assigned bus during an active school run. Route and operational details stay with the transportation team."
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
              </div>
            </Card>
          ))}

        <Card className="p-5">
          <h2 className="text-lg font-bold text-navy-900">Bus number and license plate</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            The bus number is the student's stable service number. The license plate identifies the
            physical vehicle and can change when transportation assigns another vehicle to that
            service.
          </p>
          <Link to="/guardian/routes" className={`${actionLinkClass} mt-4`}>
            View all assigned buses
          </Link>
        </Card>
      </div>
    </DashboardLayout>
  );
}
