import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Settings2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { DriverActionCard } from '@/components/driver/DriverActionCard';
import { BusQrStartScanner } from '@/components/driver/BusQrStartScanner';
import { DriverLocationStatus } from '@/components/driver/DriverLocationStatus';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDriverTracking } from '@/contexts/DriverTrackingContext';
import { fetchActiveDriverTrip } from '@/services/driverTripService';
import { fetchOwnPlannedDriverAssignments } from '@/services/driverAssignmentService';
import { confirmPreTrip, getPreTripConfirmation } from '@/services/phase6OperationsService';
import type { BusTrackingStartResult } from '@/services/busTrackingService';
import type { PlannedDriverAssignment } from '@/types/driverAssignments';
import type { DriverTrip } from '@/types/trips';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      activeTrip: DriverTrip | null;
      plannedAssignments: PlannedDriverAssignment[];
    };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPlanDate(value: string | null) {
  if (!value) return 'Open ended';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function PlannedAssignmentsCard({ assignments }: { assignments: PlannedDriverAssignment[] }) {
  return (
    <Card className="p-5" data-testid="driver-planned-assignments">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-500">Administrative guidance</p>
          <h2 className="mt-1 text-lg font-bold text-navy-900">Your planned assignments</h2>
        </div>
        <StatusPill tone="info">Planned</StatusPill>
      </div>

      {assignments.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No current or upcoming assignments are planned. You can still scan any eligible school
          authority bus when directed by operations.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {assignments.map((assignment) => {
            const today = new Date().toISOString().slice(0, 10);
            const upcoming = !!assignment.effective_from && assignment.effective_from > today;
            return (
              <div key={assignment.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-navy-900">Bus {assignment.bus_number}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {assignment.route_code} · {assignment.route_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {assignment.trip_name} ·{' '}
                      {assignment.direction === 'forward' ? 'Outbound' : 'Return'}
                    </p>
                  </div>
                  <StatusPill tone={upcoming ? 'info' : 'success'}>
                    {upcoming ? 'Upcoming plan' : 'Current plan'}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {assignment.effective_from
                    ? formatPlanDate(assignment.effective_from)
                    : 'No start date'}{' '}
                  – {formatPlanDate(assignment.effective_to)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tracking = useDriverTracking();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preTripConfirmed, setPreTripConfirmed] = useState(false);

  useEffect(() => {
    const navigationState = location.state as { driverTripMessage?: string } | null;
    if (typeof navigationState?.driverTripMessage === 'string') {
      setMessage(navigationState.driverTripMessage);
      navigate('/driver', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [trip, plannedAssignments] = await Promise.all([
        fetchActiveDriverTrip(),
        fetchOwnPlannedDriverAssignments(),
      ]);
      const confirmation = trip ? await getPreTripConfirmation(trip.id).catch(() => null) : null;
      setPreTripConfirmed(confirmation !== null);
      setState({ kind: 'ready', activeTrip: trip, plannedAssignments });
    } catch (cause) {
      setState({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Could not load your driver dashboard.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStarted(result: BusTrackingStartResult) {
    await tracking.activateTracking(result.trackingToken);
    let inspectionRecorded = result.resumed;
    if (!result.resumed) {
      try {
        await confirmPreTrip(result.trip.id);
        inspectionRecorded = true;
      } catch {
        setActionError(
          'The trip started, but the pre-trip confirmation could not be recorded. Open Trip actions to confirm it.',
        );
      }
    }
    setState((current) => ({
      kind: 'ready',
      activeTrip: result.trip,
      plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
    }));
    setPreTripConfirmed(inspectionRecorded);
    if (inspectionRecorded) setActionError(null);
    setMessage(
      result.resumed
        ? `Bus ${result.busNumber} GPS resumed on this phone.`
        : `Bus ${result.busNumber} started. This phone is now its GPS.`,
    );
  }

  const activeTrip = state.kind === 'ready' ? state.activeTrip : null;
  const plannedAssignments = state.kind === 'ready' ? state.plannedAssignments : [];
  const today = new Date().toISOString().slice(0, 10);
  const currentPlans = plannedAssignments.filter(
    (assignment) =>
      (!assignment.effective_from || assignment.effective_from <= today) &&
      (!assignment.effective_to || assignment.effective_to >= today),
  );
  const currentTripDiffersFromPlan = !!(
    activeTrip &&
    currentPlans.length > 0 &&
    !currentPlans.some(
      (assignment) =>
        assignment.bus_id === activeTrip.bus_id &&
        assignment.route_trip_pattern_id === activeTrip.route_trip_pattern_id,
    )
  );
  const isPaused = activeTrip?.status === 'paused';
  const isActive = activeTrip?.status === 'active';

  return (
    <DashboardLayout
      title="Driver Dashboard"
      portal="driver"
      navItems={[]}
      navGroups={driverNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {!activeTrip && (
          <PageHeader
            eyebrow="Driver GPS"
            title="Scan the bus to start"
            description="Scan the QR inside the bus, choose its route direction, and use this phone as the bus GPS."
          />
        )}

        {state.kind === 'loading' && (
          <DataState title="Loading driver workspace" message="Checking for an active bus trip." />
        )}
        {state.kind === 'error' && (
          <div className="space-y-4">
            <DataState title="Could not load the driver workspace" message={state.message} />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {actionError && (
          <Card role="alert" className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700">{actionError}</p>
          </Card>
        )}
        {message && (
          <Card role="status" className="border-success-200 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success-700">{message}</p>
          </Card>
        )}

        {state.kind === 'ready' && !activeTrip && (
          <div className="space-y-5">
            <BusQrStartScanner hasActiveTrip={false} onStarted={handleStarted} />
            <PlannedAssignmentsCard assignments={plannedAssignments} />
          </div>
        )}

        {state.kind === 'ready' && activeTrip && (
          <div className="space-y-5" data-testid="driver-active-trip-only">
            <Card
              className="border-success-200 p-5 ring-1 ring-success-100"
              data-testid="driver-active-bus-card"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-500">Active bus</p>
                  <h1 className="mt-1 text-2xl font-bold text-navy-900">
                    {activeTrip.bus_number_snapshot
                      ? `Bus ${activeTrip.bus_number_snapshot}`
                      : 'Active bus'}
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    {activeTrip.trip_name_snapshot ?? 'Prepared run'}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Service date {formatPlanDate(activeTrip.service_date)}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Started {formatTimestamp(activeTrip.started_at)}
                  </p>
                </div>
                <StatusPill tone={isPaused ? 'neutral' : 'success'}>{activeTrip.status}</StatusPill>
              </div>

              {preTripConfirmed ? (
                <div
                  className="mt-4 flex items-center gap-2 rounded-lg bg-success-50 p-3 text-sm font-semibold text-success-700"
                  data-testid="pre-trip-confirmed-badge"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Pre-trip inspection confirmed
                </div>
              ) : (
                <p
                  className="mt-4 text-sm font-semibold text-slate-600"
                  data-testid="pre-trip-pending-badge"
                >
                  Pre-trip inspection not confirmed
                </p>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <DriverLocationStatus
                  supported={tracking.location.supported}
                  state={tracking.location.state}
                  compact
                />
              </div>

              {(isActive || isPaused) && (
                <div
                  className="mt-5 grid gap-3 sm:grid-cols-3"
                  data-testid="driver-active-bus-actions"
                >
                  <DriverActionCard
                    label="Pickup & drop-off"
                    icon={<ClipboardCheck className="h-6 w-6" />}
                    to="/driver/pickup-drop-off"
                  />
                  <DriverActionCard
                    label="Trip actions"
                    icon={<Settings2 className="h-6 w-6" />}
                    to="/driver/trip-actions"
                  />
                  <DriverActionCard
                    label="Record exception"
                    icon={<AlertTriangle className="h-6 w-6" />}
                    to="/driver/record-exception"
                  />
                </div>
              )}
            </Card>

            {currentTripDiffersFromPlan && (
              <Card
                className="border-warning-200 bg-warning-50 p-4"
                role="status"
                data-testid="driver-plan-mismatch-notice"
              >
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden />
                  <div>
                    <p className="font-bold text-warning-800">Current trip differs from the plan</p>
                    <p className="mt-1 text-sm text-warning-800">
                      The scanned bus and route remain your confirmed active trip. The planned
                      assignment was not changed; contact operations if the difference is
                      unexpected.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <PlannedAssignmentsCard assignments={plannedAssignments} />

            {(!tracking.trackingToken ||
              tracking.location.state.kind === 'denied' ||
              tracking.location.state.kind === 'error') && (
              <BusQrStartScanner hasActiveTrip onStarted={handleStarted} />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
