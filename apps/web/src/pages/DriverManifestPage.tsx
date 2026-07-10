import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout, type DashboardNavItem } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchDriverActiveTripStudentManifest } from '@/services/driverManifestService';
import type { DriverManifestRow } from '@/types/driverManifest';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; rows: DriverManifestRow[] };

const driverNavItems: DashboardNavItem[] = [
  { label: 'Today', to: '/driver' },
  { label: 'Student Manifest', to: '/driver/manifest' },
];

function tripDirectionLabel(value: string | null): string | null {
  if (!value) return null;
  if (value === 'morning') return 'Morning';
  if (value === 'evening') return 'Evening';
  return value;
}

export function DriverManifestPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const rows = await fetchDriverActiveTripStudentManifest();
      setState({ kind: 'ready', rows });
    } catch {
      setState({ kind: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTrip = state.kind === 'ready' && state.rows.length > 0 ? state.rows[0] : null;
  const students = useMemo(
    () => (state.kind === 'ready' ? state.rows.filter((row) => row.studentId) : []),
    [state],
  );

  return (
    <DashboardLayout title="Driver Dashboard" portal="driver" navItems={driverNavItems}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          eyebrow="Active trip"
          title="Student Manifest"
          description="View students assigned to your current active trip."
        />

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              disabled={refreshing}
              data-testid="driver-manifest-refresh-button"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Link
              to="/driver"
              className="text-sm font-semibold text-navy-700 hover:text-navy-900"
            >
              Back to driver dashboard
            </Link>
          </div>
        </Card>

        {state.kind === 'loading' && (
          <div data-testid="driver-manifest-loading">
            <DataState
              title="Loading student manifest"
              message="Checking your active trip and assigned students."
            />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="driver-manifest-error">
            <DataState
              title="Could not load student manifest right now."
              message="Please try again."
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && !activeTrip && (
          <div data-testid="driver-manifest-no-active-trip">
            <DataState
              title="No active trip right now."
              message="Start a trip from your driver dashboard to see assigned students."
            />
          </div>
        )}

        {state.kind === 'ready' && activeTrip && (
          <div className="space-y-5">
            <Card className="p-5" data-testid="driver-manifest-trip-context">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-500">Active trip</p>
                  <h2 className="mt-1 text-2xl font-bold text-navy-900">
                    {activeTrip.routeName ?? 'Active route'}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-700">
                    {tripDirectionLabel(activeTrip.tripDirection) && (
                      <span>{tripDirectionLabel(activeTrip.tripDirection)} trip</span>
                    )}
                    {activeTrip.tripStatus && (
                      <span>Status: {activeTrip.tripStatus}</span>
                    )}
                  </div>
                </div>
                {activeTrip.tripStatus && <StatusPill tone="success">{activeTrip.tripStatus}</StatusPill>}
              </div>
            </Card>

            {students.length === 0 ? (
              <div data-testid="driver-manifest-no-students">
                <DataState
                  title="No students are assigned to this active trip."
                  message="Check with your transportation admin if this does not look right."
                />
              </div>
            ) : (
              <section className="grid gap-4" data-testid="driver-manifest-list">
                {students.map((student) => (
                  <Card
                    key={student.studentId ?? student.activeTripId}
                    className="p-5"
                    data-testid="driver-manifest-student-card"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-navy-900">
                          {student.studentDisplayName}
                        </h3>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="font-semibold text-gray-500">Pickup stop</dt>
                            <dd className="mt-1 text-gray-800">
                              {student.pickupStopName ?? 'Not assigned'}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-gray-500">Drop-off stop</dt>
                            <dd className="mt-1 text-gray-800">
                              {student.dropoffStopName ?? 'Not assigned'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      {student.assignmentStatus && (
                        <StatusPill tone="neutral">{student.assignmentStatus}</StatusPill>
                      )}
                    </div>
                  </Card>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
