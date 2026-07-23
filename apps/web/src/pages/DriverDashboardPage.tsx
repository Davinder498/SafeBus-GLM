import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, ChevronDown, Clock3, Route as RouteIcon } from 'lucide-react';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDriverLocationSharing } from '@/hooks/useDriverLocationSharing';
import type { LocationSharingState } from '@/hooks/useDriverLocationSharing';
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
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Action feedback.
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  async function handleStartTripFromAssignment(assignmentId: string) {
    if (activeTrip) {
      setActionError(ACTIVE_TRIP_ERROR);
      setSuccessMessage(null);
      return;
    }

    setActionInProgress(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await startTripFromAssignment(assignmentId);
      setSuccessMessage('Trip started. Location sharing is starting automatically.');
      await refreshDashboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start the trip.');
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
          eyebrow="Assignments"
          title="Your assigned trips"
          description="Choose the route trip you are ready to drive."
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

            {state.activeTrip && (
              <ActiveTripCard
                trip={state.activeTrip}
                assignment={activeAssignment}
                locationSupported={locationSharing.supported}
                locationState={locationSharing.state}
                onEnd={handleEndTrip}
                actionInProgress={actionInProgress}
              />
            )}

            {state.assignments.length === 0 && !state.activeTrip && (
              <DataState
                title="No active trip assignments."
                message="Please contact your transportation admin."
              />
            )}

            {state.assignments.length > 0 && (
              <AssignmentChooser
                assignments={state.assignments}
                activeTrip={state.activeTrip}
                onStart={handleStartTripFromAssignment}
                actionInProgress={actionInProgress}
              />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

interface ActiveTripCardProps {
  trip: DriverTrip;
  assignment: DriverAssignmentSummary | null;
  locationSupported: boolean;
  locationState: LocationSharingState;
  onEnd: () => void;
  actionInProgress: boolean;
}

function ActiveTripCard({
  trip,
  assignment,
  locationSupported,
  locationState,
  onEnd,
  actionInProgress,
}: ActiveTripCardProps) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
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
          <LocationStatus supported={locationSupported} state={locationState} />
        </div>
      </Card>
      <Button
        type="button"
        size="lg"
        fullWidth
        variant="danger"
        onClick={onEnd}
        disabled={actionInProgress}
      >
        {actionInProgress ? 'Ending trip...' : 'End Trip'}
      </Button>
    </div>
  );
}

function AssignmentChooser({
  assignments,
  activeTrip,
  onStart,
  actionInProgress,
}: {
  assignments: DriverAssignmentSummary[];
  activeTrip: DriverTrip | null;
  onStart: (assignmentId: string) => void;
  actionInProgress: boolean;
}) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');

  useEffect(() => {
    if (
      selectedAssignmentId &&
      !assignments.some((assignment) => assignment.id === selectedAssignmentId)
    ) {
      setSelectedAssignmentId('');
    }
  }, [assignments, selectedAssignmentId]);

  return (
    <section aria-labelledby="assigned-trips-heading" data-testid="driver-assigned-trips">
      <div className="mb-4">
        <h2 id="assigned-trips-heading" className="text-lg font-bold text-navy-900">
          Current trip assignments
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Select an assignment to review and start that exact trip.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AssignmentColumn
          title="Outbound"
          description="Morning or outbound runs appear on the left."
          assignments={assignments.filter((assignment) => assignment.direction === 'forward')}
          emptyMessage="No outbound trips assigned."
          activeTrip={activeTrip}
          selectedAssignmentId={selectedAssignmentId}
          setSelectedAssignmentId={setSelectedAssignmentId}
          onStart={onStart}
          actionInProgress={actionInProgress}
        />
        <AssignmentColumn
          title="Return"
          description="Afternoon or return runs appear on the right."
          assignments={assignments.filter((assignment) => assignment.direction === 'reverse')}
          emptyMessage="No return trips assigned."
          activeTrip={activeTrip}
          selectedAssignmentId={selectedAssignmentId}
          setSelectedAssignmentId={setSelectedAssignmentId}
          onStart={onStart}
          actionInProgress={actionInProgress}
        />
      </div>
    </section>
  );
}

function AssignmentColumn({
  title,
  description,
  assignments,
  emptyMessage,
  activeTrip,
  selectedAssignmentId,
  setSelectedAssignmentId,
  onStart,
  actionInProgress,
}: {
  title: string;
  description: string;
  assignments: DriverAssignmentSummary[];
  emptyMessage: string;
  activeTrip: DriverTrip | null;
  selectedAssignmentId: string;
  setSelectedAssignmentId: (assignmentId: string) => void;
  onStart: (assignmentId: string) => void;
  actionInProgress: boolean;
}) {
  return (
    <div className="space-y-3" data-testid={`driver-${title.toLowerCase()}-assignments`}>
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
        <h3 className="text-base font-bold text-navy-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>

      {assignments.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-500">{emptyMessage}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const selected = assignment.id === selectedAssignmentId;
            const inProgress = assignmentMatchesTrip(assignment, activeTrip);
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
                    <span
                      className={`mt-2 block text-sm font-medium ${
                        inProgress ? 'text-success-700' : 'text-gray-500'
                      }`}
                    >
                      {inProgress ? 'In progress' : 'Ready'}
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
                    {inProgress ? (
                      <p className="rounded-lg bg-success-50 p-3 text-sm font-semibold text-success-700">
                        This trip is currently in progress.
                      </p>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          fullWidth
                          onClick={() => onStart(assignment.id)}
                          disabled={actionInProgress}
                          data-testid="driver-assignment-start-button"
                        >
                          {actionInProgress ? 'Starting trip...' : `Start ${assignment.tripName}`}
                        </Button>
                        <p className="text-xs leading-5 text-gray-500">
                          Starting the trip requests location permission and begins sharing this bus
                          automatically.
                        </p>
                      </>
                    )}
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

function assignmentMatchesTrip(
  assignment: DriverAssignmentSummary,
  activeTrip: DriverTrip | null,
): boolean {
  if (!activeTrip) return false;
  if (activeTrip.driver_route_assignment_id) {
    return activeTrip.driver_route_assignment_id === assignment.id;
  }
  return (
    activeTrip.bus_id === assignment.busId &&
    activeTrip.route_id === assignment.routeId &&
    activeTrip.route_trip_pattern_id === assignment.tripPatternId
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

interface LocationStatusProps {
  supported: boolean;
  state: LocationSharingState;
}

function LocationStatus({ supported, state }: LocationStatusProps) {
  const tracking = state.kind === 'waiting' || state.kind === 'sharing' || state.kind === 'offline';
  const errorMessage = state.kind === 'error' || state.kind === 'denied' ? state.message : null;

  let statusMessage = 'Share your live bus location during this trip.';
  let statusTone: 'success' | 'warning' | 'neutral' = 'neutral';
  let statusLabel: string | null = null;
  if (state.kind === 'waiting') {
    statusMessage = 'Waiting for the first location update...';
    statusLabel = 'waiting';
  } else if (state.kind === 'sharing') {
    statusMessage =
      state.delivery === 'active'
        ? `Location sharing active. Last update ${formatTimestamp(state.lastUpdateAt)}.`
        : `Location updates are delayed. Last successful update ${formatTimestamp(state.lastUpdateAt)}.`;
    statusTone = state.delivery === 'active' ? 'success' : 'warning';
    statusLabel = state.delivery === 'active' ? 'active' : 'delayed';
  } else if (state.kind === 'offline') {
    statusMessage = state.lastUpdateAt
      ? `Offline. Last successful update ${formatTimestamp(state.lastUpdateAt)}. Tracking will resume automatically.`
      : 'Offline. Waiting to send the first location when the connection returns.';
    statusTone = 'warning';
    statusLabel = 'offline';
  } else if (state.kind === 'denied') {
    statusMessage = 'Location permission denied.';
  }

  if (!supported) {
    return (
      <div data-testid="driver-location-panel">
        <h3 className="font-bold text-navy-900">Location status</h3>
        <p data-testid="driver-location-error" className="mt-2 text-sm text-danger-700">
          Location sharing is not supported in this browser.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="driver-location-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-navy-900">Location status</h3>
          <p data-testid="driver-location-status" className="mt-1 text-sm text-gray-600">
            {statusMessage}
          </p>
          {errorMessage && (
            <p
              data-testid="driver-location-error"
              role="alert"
              className="mt-2 text-sm text-danger-700"
            >
              {errorMessage}
            </p>
          )}
        </div>
        {statusLabel && <StatusPill tone={statusTone}>{statusLabel}</StatusPill>}
      </div>
      {!tracking && !errorMessage && (
        <p className="mt-2 text-sm text-gray-600">
          Location permission is being requested automatically.
        </p>
      )}
    </div>
  );
}
