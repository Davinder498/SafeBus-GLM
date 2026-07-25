import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, ChevronDown, ClipboardCheck, Clock3, Route as RouteIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DriverLocationStatus,
  type DriverLocationStatusProps,
} from '@/components/driver/DriverLocationStatus';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDriverLocationSharing } from '@/hooks/useDriverLocationSharing';
import { fetchDriverAssignments } from '@/services/driverAssignmentService';
import {
  endDriverTrip,
  fetchActiveDriverTrip,
  startTripFromAssignment,
} from '@/services/driverTripService';
import type { DriverAssignmentSummary } from '@/types/driverAssignments';
import type { DriverTrip } from '@/types/trips';

const ACTIVE_TRIP_ERROR = 'You already have an active trip. End it before starting another.';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; assignments: DriverAssignmentSummary[]; activeTrip: DriverTrip | null };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Action feedback.
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingStartAssignment, setPendingStartAssignment] =
    useState<DriverAssignmentSummary | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    setState({ kind: 'loading' });
    setActionError(null);
    setSuccessMessage(null);
    try {
      const [assignments, activeTrip] = await Promise.all([
        fetchDriverAssignments(),
        fetchActiveDriverTrip(),
      ]);
      setState({ kind: 'ready', assignments, activeTrip });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load your driver dashboard.';
      setState({ kind: 'error', message });
    }
  }, []);

  /**
   * Refresh the dashboard data WITHOUT clearing the action success/error
   * messages. Used after start/end so the user still sees the feedback while
   * the active-trip card updates.
   */
  const refreshDashboard = useCallback(async () => {
    try {
      const [assignments, activeTrip] = await Promise.all([
        fetchDriverAssignments(),
        fetchActiveDriverTrip(),
      ]);
      setState({ kind: 'ready', assignments, activeTrip });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not refresh your driver dashboard.';
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeTrip = state.kind === 'ready' ? state.activeTrip : null;

  // Resolve labels through the exact selected assignment, with an ID fallback
  // for trip history created before migration 0054.
  const activeAssignment = useMemo(() => {
    if (state.kind !== 'ready' || !state.activeTrip) return null;
    return (
      state.assignments.find(
        (assignment) => assignment.id === state.activeTrip!.driver_route_assignment_id,
      ) ??
      state.assignments.find(
        (assignment) =>
          assignment.busId === state.activeTrip!.bus_id &&
          assignment.routeId === state.activeTrip!.route_id &&
          assignment.tripPatternId === state.activeTrip!.route_trip_pattern_id,
      ) ??
      null
    );
  }, [state]);

  async function handleConfirmStartTrip() {
    const assignment = pendingStartAssignment;
    if (!assignment) return;
    if (activeTrip) {
      setActionError(ACTIVE_TRIP_ERROR);
      setSuccessMessage(null);
      setPendingStartAssignment(null);
      return;
    }

    setActionInProgress(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await startTripFromAssignment(assignment.id);
      setPendingStartAssignment(null);
      navigate('/driver/pickup-drop-off', {
        state: {
          tripStarted: true,
          tripName: assignment.tripName,
        },
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start the trip.');
      setPendingStartAssignment(null);
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleEndTrip() {
    if (!activeTrip) return;
    setActionInProgress(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await endDriverTrip(activeTrip.id);
      setConfirmEndOpen(false);
      setSuccessMessage('Trip ended. Nice work.');
      await refreshDashboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not end the trip.');
    } finally {
      setActionInProgress(false);
    }
  }

  // Location sharing is wired to the active trip id (null when no active trip).
  const activeTripId = state.kind === 'ready' && state.activeTrip ? state.activeTrip.id : null;
  const locationSharing = useDriverLocationSharing(activeTripId, true);

  return (
    <DashboardLayout
      title="Driver Dashboard"
      portal="driver"
      navItems={[]}
      navGroups={driverNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow={activeTrip ? 'Trip in progress' : 'Assignments'}
          title={activeTrip ? 'Your active trip' : 'Your assigned trips'}
          description={
            activeTrip
              ? 'Only this trip is available until you end it.'
              : 'Open Outbound or Return, then choose the exact route trip you are ready to drive.'
          }
        />

        {state.kind === 'loading' && (
          <DataState
            title="Loading your dashboard"
            message="Checking your assignments and active trip..."
          />
        )}

        {state.kind === 'error' && (
          <div className="space-y-4">
            <DataState title="Could not load your dashboard" message={state.message} />
            <Button type="button" variant="secondary" onClick={() => void loadDashboard()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="space-y-5">
            {actionError && (
              <Card
                role="alert"
                aria-live="assertive"
                className="border-danger-200 bg-danger-50 p-4"
              >
                <p className="text-sm font-semibold text-danger-700">{actionError}</p>
              </Card>
            )}
            {successMessage && (
              <Card
                role="status"
                aria-live="polite"
                className="border-success-200 bg-success-50 p-4"
              >
                <p className="text-sm font-semibold text-success-700">{successMessage}</p>
              </Card>
            )}

            {state.activeTrip ? (
              <ActiveTripCard
                trip={state.activeTrip}
                assignment={activeAssignment}
                locationSupported={locationSharing.supported}
                locationState={locationSharing.state}
                onOpenManifest={() => navigate('/driver/pickup-drop-off')}
                onEnd={() => setConfirmEndOpen(true)}
                actionInProgress={actionInProgress}
              />
            ) : (
              <>
                {state.assignments.length === 0 && (
                  <DataState
                    title="No active trip assignments."
                    message="Please contact your transportation admin."
                  />
                )}

                {state.assignments.length > 0 && (
                  <AssignmentChooser
                    assignments={state.assignments}
                    onStart={setPendingStartAssignment}
                    actionInProgress={actionInProgress}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingStartAssignment !== null}
        title={`Start ${pendingStartAssignment?.tripName ?? 'this trip'}?`}
        description={
          pendingStartAssignment ? (
            <div className="space-y-1">
              <p>
                Route:{' '}
                <span className="font-semibold text-slate-700">
                  {pendingStartAssignment.routeName} ({pendingStartAssignment.routeCode})
                </span>
              </p>
              <p>
                Named trip:{' '}
                <span className="font-semibold text-slate-700">
                  {pendingStartAssignment.tripName}
                </span>
              </p>
              <p>
                Bus:{' '}
                <span className="font-semibold text-slate-700">
                  {pendingStartAssignment.busLabel}
                </span>
              </p>
              <p className="pt-2">Confirm that this is the exact trip you are ready to drive.</p>
            </div>
          ) : null
        }
        confirmLabel="Start trip"
        busy={actionInProgress}
        onConfirm={() => void handleConfirmStartTrip()}
        onCancel={() => setPendingStartAssignment(null)}
      />
      <ConfirmDialog
        open={confirmEndOpen}
        title={`End ${state.kind === 'ready' && state.activeTrip ? (state.activeTrip.trip_name_snapshot ?? activeAssignment?.tripName ?? 'this trip') : 'this trip'}?`}
        description={
          state.kind === 'ready' && state.activeTrip ? (
            <div className="space-y-1">
              <p>
                Route:{' '}
                <span className="font-semibold text-slate-700">
                  {activeAssignment?.routeName ?? 'Assigned route'}
                </span>
              </p>
              <p>
                Named trip:{' '}
                <span className="font-semibold text-slate-700">
                  {state.activeTrip.trip_name_snapshot ??
                    activeAssignment?.tripName ??
                    'Active trip'}
                </span>
              </p>
              <p>
                Bus:{' '}
                <span className="font-semibold text-slate-700">
                  {activeAssignment?.busLabel ?? state.activeTrip.bus_id}
                </span>
              </p>
              <p className="pt-2">
                Ending the trip stops pickup and drop-off recording for this run.
              </p>
            </div>
          ) : null
        }
        confirmLabel="End trip"
        destructive
        busy={actionInProgress}
        onConfirm={() => void handleEndTrip()}
        onCancel={() => setConfirmEndOpen(false)}
      />
    </DashboardLayout>
  );
}

interface ActiveTripCardProps {
  trip: DriverTrip;
  assignment: DriverAssignmentSummary | null;
  locationSupported: boolean;
  locationState: DriverLocationStatusProps['state'];
  onOpenManifest: () => void;
  onEnd: () => void;
  actionInProgress: boolean;
}

function ActiveTripCard({
  trip,
  assignment,
  locationSupported,
  locationState,
  onOpenManifest,
  onEnd,
  actionInProgress,
}: ActiveTripCardProps) {
  return (
    <div className="space-y-5" data-testid="driver-active-trip-only">
      <Card className="border-success-200 p-5 ring-1 ring-success-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500">Active trip</p>
            <h2 className="mt-1 text-2xl font-bold text-navy-900">
              {trip.trip_name_snapshot ?? assignment?.tripName ?? 'Active trip'}
            </h2>
            <p className="mt-1 text-sm font-semibold text-gray-700">
              {assignment?.routeName ?? 'Assigned route'} · Bus{' '}
              {assignment?.busLabel ?? trip.bus_id}
            </p>
            <p className="mt-2 text-base text-gray-700">
              Your bus location is available to authorized families and transportation admins.
            </p>
            <p className="mt-1 text-sm text-gray-600">Started {formatTimestamp(trip.started_at)}</p>
          </div>
          <StatusPill tone="success">active</StatusPill>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <DriverLocationStatus supported={locationSupported} state={locationState} />
        </div>
      </Card>
      <Card className="space-y-4 p-4 sm:p-5">
        <Button
          type="button"
          size="lg"
          fullWidth
          variant="primary"
          leftIcon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
          onClick={onOpenManifest}
          disabled={actionInProgress}
          data-testid="driver-active-trip-manifest-button"
        >
          Open pickup &amp; drop-off
        </Button>
        <div className="border-t border-slate-200 pt-4">
          <Button
            type="button"
            size="lg"
            fullWidth
            variant="danger"
            onClick={onEnd}
            disabled={actionInProgress}
          >
            End trip
          </Button>
          <p className="mt-2 text-center text-xs leading-5 text-gray-500">
            End only after this run and its pickup and drop-off work are complete.
          </p>
        </div>
      </Card>
    </div>
  );
}

function AssignmentChooser({
  assignments,
  onStart,
  actionInProgress,
}: {
  assignments: DriverAssignmentSummary[];
  onStart: (assignment: DriverAssignmentSummary) => void;
  actionInProgress: boolean;
}) {
  const [expandedDirection, setExpandedDirection] = useState<
    DriverAssignmentSummary['direction'] | null
  >(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');

  useEffect(() => {
    if (
      selectedAssignmentId &&
      !assignments.some((assignment) => assignment.id === selectedAssignmentId)
    ) {
      setSelectedAssignmentId('');
    }
  }, [assignments, selectedAssignmentId]);

  function toggleDirection(direction: DriverAssignmentSummary['direction']) {
    setSelectedAssignmentId('');
    setExpandedDirection((current) => (current === direction ? null : direction));
  }

  return (
    <section aria-labelledby="assigned-trips-heading" data-testid="driver-assigned-trips">
      <div className="mb-4">
        <h2 id="assigned-trips-heading" className="text-lg font-bold text-navy-900">
          Current trip assignments
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Open one direction, then select a route to review and start that exact trip.
        </p>
      </div>

      <div className="space-y-4">
        <AssignmentDirectionGroup
          direction="forward"
          title="Outbound"
          description="Morning and outbound runs."
          assignments={assignments.filter((assignment) => assignment.direction === 'forward')}
          emptyMessage="No outbound trips assigned."
          expanded={expandedDirection === 'forward'}
          onToggle={() => toggleDirection('forward')}
          selectedAssignmentId={selectedAssignmentId}
          setSelectedAssignmentId={setSelectedAssignmentId}
          onStart={onStart}
          actionInProgress={actionInProgress}
        />
        <AssignmentDirectionGroup
          direction="reverse"
          title="Return"
          description="Afternoon and return runs."
          assignments={assignments.filter((assignment) => assignment.direction === 'reverse')}
          emptyMessage="No return trips assigned."
          expanded={expandedDirection === 'reverse'}
          onToggle={() => toggleDirection('reverse')}
          selectedAssignmentId={selectedAssignmentId}
          setSelectedAssignmentId={setSelectedAssignmentId}
          onStart={onStart}
          actionInProgress={actionInProgress}
        />
      </div>
    </section>
  );
}

function AssignmentDirectionGroup({
  direction,
  title,
  description,
  assignments,
  emptyMessage,
  expanded,
  onToggle,
  selectedAssignmentId,
  setSelectedAssignmentId,
  onStart,
  actionInProgress,
}: {
  direction: DriverAssignmentSummary['direction'];
  title: string;
  description: string;
  assignments: DriverAssignmentSummary[];
  emptyMessage: string;
  expanded: boolean;
  onToggle: () => void;
  selectedAssignmentId: string;
  setSelectedAssignmentId: (assignmentId: string) => void;
  onStart: (assignment: DriverAssignmentSummary) => void;
  actionInProgress: boolean;
}) {
  const groupId = `driver-${direction}-assignment-group`;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid={`driver-${title.toLowerCase()}-assignments`}
    >
      <button
        type="button"
        className="flex min-h-16 w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500 sm:px-5"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={groupId}
        data-testid={`driver-${title.toLowerCase()}-toggle`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <RouteIcon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-navy-900">{title}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {assignments.length} {assignments.length === 1 ? 'trip' : 'trips'}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-gray-600">{description}</span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div id={groupId} className="space-y-4 border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          {assignments.length === 0 && (
            <Card className="p-5">
              <p className="text-sm font-medium text-gray-500">{emptyMessage}</p>
            </Card>
          )}
          {assignments.map((assignment) => {
            const selected = assignment.id === selectedAssignmentId;
            const panelId = `start-assignment-${assignment.id}`;

            return (
              <Card
                key={assignment.id}
                interactive={!selected}
                className={selected ? 'border-navy-400 ring-2 ring-navy-100' : undefined}
                data-testid="driver-assignment-card"
                data-assignment-id={assignment.id}
              >
                <button
                  type="button"
                  className="flex min-h-28 w-full items-center gap-4 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500"
                  onClick={() => setSelectedAssignmentId(selected ? '' : assignment.id)}
                  aria-expanded={selected}
                  aria-controls={panelId}
                  data-testid="driver-assignment-select-button"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                    <Bus className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-500">
                      Assigned route
                    </span>
                    <span
                      className="mt-1 block text-xl font-bold text-navy-900"
                      data-testid="driver-assignment-route-name"
                    >
                      {assignment.routeName}
                    </span>
                    <span
                      className="mt-1 block text-sm font-medium text-gray-600"
                      data-testid="driver-assignment-trip-name"
                    >
                      {assignment.tripName} · Bus {assignment.busLabel}
                    </span>
                    <span className="mt-2 block text-sm font-medium text-success-700">
                      Ready to review
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                      selected ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>

                {selected && (
                  <div id={panelId} className="space-y-4 border-t border-slate-100 p-5 pt-4">
                    <AssignmentDetails assignment={assignment} />
                    <Button
                      type="button"
                      size="lg"
                      fullWidth
                      variant="success"
                      onClick={() => onStart(assignment)}
                      disabled={actionInProgress}
                      data-testid="driver-assignment-start-button"
                    >
                      {actionInProgress ? 'Starting trip...' : `Start trip: ${assignment.tripName}`}
                    </Button>
                    <p className="text-xs leading-5 text-gray-500">
                      You will confirm the exact route, trip, and bus before it starts.
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssignmentDetails({ assignment }: { assignment: DriverAssignmentSummary }) {
  return (
    <dl className="grid gap-3 text-sm text-gray-700">
      <div className="flex items-start gap-2">
        <RouteIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <div>
          <dt className="sr-only">Route</dt>
          <dd>
            {assignment.routeName} ({assignment.routeCode}) ·{' '}
            {assignment.direction === 'forward' ? 'Forward' : 'Return'}
          </dd>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <div>
          <dt className="sr-only">Scheduled start</dt>
          <dd>
            {assignment.scheduledStartTime
              ? `Scheduled ${formatScheduledTime(assignment.scheduledStartTime)}`
              : 'No scheduled start time'}
          </dd>
        </div>
      </div>
    </dl>
  );
}

function formatScheduledTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const time = new Date(2000, 0, 1, hours, minutes);
  return time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
