import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import { useDriverLocationSharing } from '@/hooks/useDriverLocationSharing';
import type { LocationSharingState } from '@/hooks/useDriverLocationSharing';
import { fetchDriverAssignments } from '@/services/driverAssignmentService';
import {
  endDriverTrip,
  fetchActiveDriverTrip,
  startTripFromAssignment,
} from '@/services/driverTripService';
import type { DriverAssignmentSummary } from '@/types/driverAssignments';
import type { DriverTrip, TripType } from '@/types/trips';

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

function tripTypeLabel(tripType: TripType): string {
  return tripType === 'morning' ? 'Morning' : 'Evening';
}

export function DriverDashboardPage() {
  const { profile } = useAuth();
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
      const message = err instanceof Error ? err.message : 'Could not refresh your driver dashboard.';
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeTrip = state.kind === 'ready' ? state.activeTrip : null;

  // Resolve bus/route labels for the active trip from the loaded assignments.
  const activeAssignment = useMemo(() => {
    if (state.kind !== 'ready' || !state.activeTrip) return null;
    return state.assignments.find(
      (a) => a.busId === state.activeTrip!.bus_id && a.routeId === state.activeTrip!.route_id,
    ) ?? null;
  }, [state]);

  async function handleStartTripFromAssignment(assignmentId: string) {
    setActionInProgress(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await startTripFromAssignment(assignmentId);
      setSuccessMessage('Trip started. Have a safe drive.');
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

  const driverName = profile?.full_name ?? 'Driver';

  // Location sharing is wired to the active trip id (null when no active trip).
  const activeTripId = state.kind === 'ready' && state.activeTrip ? state.activeTrip.id : null;
  const locationSharing = useDriverLocationSharing(activeTripId);

  return (
    <DashboardLayout title="Driver Dashboard" portal="driver" navItems={['Today']}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Today"
          title="Driver Dashboard"
          description="Start and end your trip from your assigned work."
        />

        {state.kind === 'loading' && <DataState title="Loading your dashboard" message="Checking your assignments and active trip..." />}

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
              <Card role="status" aria-live="polite" className="border-success-200 bg-success-50 p-4">
                <p className="text-sm font-semibold text-success-700">{successMessage}</p>
              </Card>
            )}

            {state.activeTrip && (
              <LocationSharingPanel
                supported={locationSharing.supported}
                state={locationSharing.state}
              />
            )}

            <StudentManifestLinkCard hasActiveTrip={Boolean(state.activeTrip)} />

            {state.activeTrip ? (
              <ActiveTripCard
                trip={state.activeTrip}
                busNumber={activeAssignment?.busLabel ?? null}
                routeName={activeAssignment?.routeName ?? null}
                onEnd={handleEndTrip}
                actionInProgress={actionInProgress}
              />
            ) : state.assignments.length === 0 ? (
              <DataState
                title="No active trip assignments."
                message="Please contact your transportation admin."
              />
            ) : (
              <AssignmentListCard
                driverName={driverName}
                assignments={state.assignments}
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

function StudentManifestLinkCard({ hasActiveTrip }: { hasActiveTrip: boolean }) {
  return (
    <Card className="p-5" data-testid="driver-manifest-link-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Student manifest</h2>
          <p className="mt-1 text-sm text-gray-600">
            View students assigned to your current active trip.
          </p>
        </div>
        <Link
          to="/driver/manifest"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy-100 px-4 py-2.5 text-base font-semibold text-navy-700 transition-colors hover:bg-navy-200"
        >
          {hasActiveTrip ? 'Open manifest' : 'Check manifest'}
        </Link>
      </div>
    </Card>
  );
}

interface ActiveTripCardProps {
  trip: DriverTrip;
  busNumber: string | null;
  routeName: string | null;
  onEnd: () => void;
  actionInProgress: boolean;
}

function ActiveTripCard({ trip, busNumber, routeName, onEnd, actionInProgress }: ActiveTripCardProps) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500">Active trip</p>
            <h2 className="mt-1 text-2xl font-bold text-navy-900">
              {routeName ?? 'Active route'}
            </h2>
            <p className="mt-2 text-base text-gray-700">
              Bus {busNumber ?? trip.bus_id} &middot; {tripTypeLabel(trip.trip_type)} trip
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Started {formatTimestamp(trip.started_at)}
            </p>
          </div>
          <StatusPill tone="success">active</StatusPill>
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

interface AssignmentListCardProps {
  driverName: string;
  assignments: DriverAssignmentSummary[];
  onStart: (assignmentId: string) => void;
  actionInProgress: boolean;
}

function AssignmentListCard({
  driverName,
  assignments,
  onStart,
  actionInProgress,
}: AssignmentListCardProps) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-500">Signed in as</p>
        <p className="mt-1 text-lg font-bold text-navy-900">{driverName}</p>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold text-navy-900">Your assignments</h2>
        <p className="mt-1 text-sm text-gray-600">
          Start a trip from one of your assigned routes below.
        </p>
      </Card>

      {assignments.map((assignment) => (
        <Card key={assignment.id} className="p-5" data-testid="driver-assignment-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-navy-900">
                {assignment.routeName ?? 'Assigned route'}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Bus {assignment.busLabel ?? assignment.busId} &middot; {tripTypeLabel(assignment.tripType)} trip
              </p>
            </div>
            <Button
              type="button"
              size="md"
              onClick={() => onStart(assignment.id)}
              disabled={actionInProgress}
              data-testid="driver-assignment-start-button"
            >
              {actionInProgress ? 'Starting...' : 'Start Trip'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

interface LocationSharingPanelProps {
  supported: boolean;
  state: LocationSharingState;
}

function LocationSharingPanel({
  supported,
  state,
}: LocationSharingPanelProps) {
  const errorMessage = state.kind === 'error' || state.kind === 'denied' ? state.message : null;

  let statusMessage = 'Starting automatic location sharing...';
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

  // Browser does not support geolocation.
  if (!supported) {
    return (
      <Card data-testid="driver-location-panel" className="p-5">
        <h2 className="text-lg font-bold text-navy-900">Location sharing</h2>
        <p
          data-testid="driver-location-error"
          className="mt-2 text-sm text-danger-700"
        >
          Location sharing is not supported in this browser.
        </p>
      </Card>
    );
  }

  return (
    <Card data-testid="driver-location-panel" className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Location sharing</h2>
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
    </Card>
  );
}
