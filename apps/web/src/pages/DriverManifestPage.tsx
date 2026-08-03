import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, UserCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { DriverLocationStatus } from '@/components/driver/DriverLocationStatus';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { StudentQrScanner } from '@/components/driver/StudentQrScanner';
import { useDriverTracking } from '@/contexts/DriverTrackingContext';
import {
  fetchDriverActiveTripStudentManifest,
  markStudentDroppedOffForActiveTrip,
  markStudentPickedUpForActiveTrip,
} from '@/services/driverManifestService';
import type { DriverManifestRow } from '@/types/driverManifest';

type LoadState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: DriverManifestRow[] };

function tripDirectionLabel(value: string | null): string | null {
  if (!value) return null;
  if (value === 'morning') return 'Morning';
  if (value === 'evening') return 'Evening';
  return value;
}

function studentTripStatusLabel(value: DriverManifestRow['studentTripStatus']): string {
  if (value === 'picked_up') return 'Picked up';
  if (value === 'dropped_off') return 'Dropped off';
  return 'Not picked up';
}

export function DriverManifestPage() {
  const location = useLocation();
  const tracking = useDriverTracking();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  const updateStudentStatus = useCallback(
    async (studentId: string, action: 'pickup' | 'dropoff'): Promise<boolean> => {
      setPendingStudentId(studentId);
      setActionError(null);
      setActionSuccess(null);

      try {
        if (action === 'pickup') {
          await markStudentPickedUpForActiveTrip(studentId);
        } else {
          await markStudentDroppedOffForActiveTrip(studentId);
        }
        const rows = await fetchDriverActiveTripStudentManifest();
        setState({ kind: 'ready', rows });
        setActionSuccess(action === 'pickup' ? 'Pickup recorded.' : 'Drop-off recorded.');
        return true;
      } catch {
        setActionError('Could not update student status. Please try again.');
        return false;
      } finally {
        setPendingStudentId(null);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const activeTrip = state.kind === 'ready' && state.rows.length > 0 ? state.rows[0] : null;
  const students = useMemo(
    () => (state.kind === 'ready' ? state.rows.filter((row) => row.studentId) : []),
    [state],
  );
  const navigationState = location.state as { tripStarted?: boolean; tripName?: string } | null;

  return (
    <DashboardLayout
      title="Pickup & drop-off"
      portal="driver"
      navItems={[]}
      navGroups={driverNavGroups}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          eyebrow="Active trip"
          title="Pickup & drop-off"
          description="Record pickup and drop-off for students assigned to the active trip."
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
            <Link to="/driver" className="text-sm font-semibold text-navy-700 hover:text-navy-900">
              {activeTrip ? 'Back to active bus' : 'Back to scan bus'}
            </Link>
          </div>
        </Card>

        {navigationState?.tripStarted && activeTrip && (
          <Card
            role="status"
            aria-live="polite"
            className="border-success-200 bg-success-50 p-4"
            data-testid="driver-trip-started-message"
          >
            <p className="text-sm font-semibold text-success-800">
              {navigationState.tripName ?? activeTrip.tripName ?? 'Trip'} started. Location sharing
              is starting automatically.
            </p>
          </Card>
        )}

        {(actionError || actionSuccess) && (
          <div
            className={`rounded-md border px-4 py-3 text-sm font-semibold ${
              actionError
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-green-200 bg-green-50 text-green-800'
            }`}
            role="status"
            data-testid="driver-manifest-action-message"
          >
            {actionError ?? actionSuccess}
          </div>
        )}

        {state.kind === 'loading' && (
          <div data-testid="driver-manifest-loading">
            <DataState
              title="Loading pickup and drop-off"
              message="Checking the active trip and its assigned students."
            />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="space-y-4" data-testid="driver-manifest-error">
            <DataState
              title="Could not load pickup and drop-off right now."
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
              message="Scan the bus from your driver dashboard and choose a route direction to start."
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
                    {activeTrip.tripName ?? 'Active trip'}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    {activeTrip.routeName ?? 'Assigned route'}
                    {activeTrip.busNumber ? ` · Bus ${activeTrip.busNumber}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-700">
                    {tripDirectionLabel(activeTrip.tripDirection) && (
                      <span>{tripDirectionLabel(activeTrip.tripDirection)} trip</span>
                    )}
                    {activeTrip.tripStatus && <span>Status: {activeTrip.tripStatus}</span>}
                  </div>
                </div>
                {activeTrip.tripStatus && (
                  <StatusPill tone="success">{activeTrip.tripStatus}</StatusPill>
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-5" data-testid="driver-manifest-location-status">
              <DriverLocationStatus
                supported={tracking.location.supported}
                state={tracking.location.state}
                compact
              />
            </Card>

            <StudentQrScanner onRecord={updateStudentStatus} busyStudentId={pendingStudentId} />

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
                          <div>
                            <dt className="font-semibold text-gray-500">Student status</dt>
                            <dd className="mt-1 text-gray-800">
                              {studentTripStatusLabel(student.studentTripStatus)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
                        <StatusPill
                          tone={
                            student.studentTripStatus === 'dropped_off'
                              ? 'success'
                              : student.studentTripStatus === 'picked_up'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {studentTripStatusLabel(student.studentTripStatus)}
                        </StatusPill>
                        {student.studentId && student.studentTripStatus !== 'dropped_off' && (
                          <Button
                            type="button"
                            size="lg"
                            className="w-full sm:w-auto"
                            variant={
                              student.studentTripStatus === 'picked_up' ? 'primary' : 'success'
                            }
                            leftIcon={
                              student.studentTripStatus === 'picked_up' ? (
                                <LogOut className="h-5 w-5" aria-hidden />
                              ) : (
                                <UserCheck className="h-5 w-5" aria-hidden />
                              )
                            }
                            onClick={() =>
                              void updateStudentStatus(
                                student.studentId as string,
                                student.studentTripStatus === 'picked_up' ? 'dropoff' : 'pickup',
                              )
                            }
                            disabled={pendingStudentId === student.studentId}
                            data-testid={
                              student.studentTripStatus === 'picked_up'
                                ? 'driver-manifest-mark-dropoff'
                                : 'driver-manifest-mark-pickup'
                            }
                          >
                            {pendingStudentId === student.studentId
                              ? 'Updating...'
                              : student.studentTripStatus === 'picked_up'
                                ? 'Mark dropped off'
                                : 'Mark picked up'}
                          </Button>
                        )}
                      </div>
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
