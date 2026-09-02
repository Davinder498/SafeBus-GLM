import { useCallback, useEffect, useState } from 'react';
import { Bus, ClipboardCheck, Pause, Play, Square, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BusQrStartScanner } from '@/components/driver/BusQrStartScanner';
import { DriverLocationStatus } from '@/components/driver/DriverLocationStatus';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatusPill } from '@/components/ui/StatusPill';
import { Textarea } from '@/components/ui/Textarea';
import { useDriverTracking } from '@/contexts/DriverTrackingContext';
import {
  cancelDriverTrip,
  endDriverTrip,
  fetchActiveDriverTrip,
  pauseDriverTrip,
  resumeDriverTrip,
} from '@/services/driverTripService';
import { fetchOwnPlannedDriverAssignments } from '@/services/driverAssignmentService';
import {
  confirmPreTrip,
  getPreTripConfirmation,
  recordTripException,
  type TripExceptionType,
} from '@/services/phase6OperationsService';
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

const EXCEPTION_TYPES: { value: TripExceptionType; label: string }[] = [
  { value: 'traffic_delay', label: 'Traffic delay' },
  { value: 'weather_delay', label: 'Weather delay' },
  { value: 'mechanical_issue', label: 'Mechanical issue' },
  { value: 'road_closure', label: 'Road closure' },
  { value: 'missed_stop', label: 'Missed stop' },
  { value: 'late_arrival', label: 'Late arrival' },
  { value: 'early_arrival', label: 'Early arrival' },
  { value: 'student_issue', label: 'Student boarding issue' },
  { value: 'other_operational', label: 'Other operational note' },
];

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
      <p className="mt-3 text-sm leading-6 text-slate-600">
        These assignments help you prepare. Scan the bus QR to confirm the bus and route direction
        you are actually operating.
      </p>
      {assignments.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No current or upcoming assignments are planned. You can still scan any eligible tenant bus
          when directed by operations.
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
  const tracking = useDriverTracking();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // Phase 6 operational state
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [preTripConfirmed, setPreTripConfirmed] = useState(false);
  const [confirmingPreTrip, setConfirmingPreTrip] = useState(false);
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionType, setExceptionType] = useState<TripExceptionType>('traffic_delay');
  const [exceptionDetail, setExceptionDetail] = useState('');
  const [recordingException, setRecordingException] = useState(false);

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
    setState((current) => ({
      kind: 'ready',
      activeTrip: result.trip,
      plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
    }));
    setPreTripConfirmed(false);
    setActionError(null);
    setMessage(
      result.resumed
        ? `Bus ${result.busNumber} GPS resumed on this phone.`
        : `Bus ${result.busNumber} started. This phone is now its GPS.`,
    );
  }

  async function handleEndTrip() {
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setEnding(true);
    setActionError(null);
    try {
      await endDriverTrip(state.activeTrip.id);
      tracking.clearTracking();
      setConfirmEndOpen(false);
      setMessage('Trip ended. Location sharing stopped.');
      setPreTripConfirmed(false);
      setState((current) => ({
        kind: 'ready',
        activeTrip: null,
        plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
      }));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not end this trip.');
    } finally {
      setEnding(false);
    }
  }

  // Phase 6 handlers ----------------------------------------------------
  async function handlePauseTrip() {
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setPausing(true);
    setActionError(null);
    try {
      const updated = await pauseDriverTrip(state.activeTrip.id);
      tracking.location.stop();
      setState((current) => ({
        kind: 'ready',
        activeTrip: updated,
        plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
      }));
      setMessage('Trip paused. Location sharing stopped until the trip resumes.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not pause this trip.');
    } finally {
      setPausing(false);
    }
  }

  async function handleResumeTrip() {
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setResuming(true);
    setActionError(null);
    try {
      const updated = await resumeDriverTrip(state.activeTrip.id);
      tracking.location.start();
      setState((current) => ({
        kind: 'ready',
        activeTrip: updated,
        plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
      }));
      setMessage('Trip resumed.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not resume this trip.');
    } finally {
      setResuming(false);
    }
  }

  async function handleCancelTrip() {
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setCancelling(true);
    setActionError(null);
    try {
      await cancelDriverTrip(state.activeTrip.id, cancelReason.trim() || null);
      tracking.clearTracking();
      setConfirmCancelOpen(false);
      setCancelReason('');
      setPreTripConfirmed(false);
      setMessage('Trip cancelled and recorded in the audit trail.');
      setState((current) => ({
        kind: 'ready',
        activeTrip: null,
        plannedAssignments: current.kind === 'ready' ? current.plannedAssignments : [],
      }));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not cancel this trip.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmPreTrip() {
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setConfirmingPreTrip(true);
    setActionError(null);
    try {
      await confirmPreTrip(state.activeTrip.id);
      setPreTripConfirmed(true);
      setMessage('Pre-trip inspection confirmed and recorded.');
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Could not confirm the pre-trip inspection.',
      );
    } finally {
      setConfirmingPreTrip(false);
    }
  }

  async function handleRecordException(event: React.FormEvent) {
    event.preventDefault();
    if (state.kind !== 'ready' || !state.activeTrip) return;
    setRecordingException(true);
    setActionError(null);
    try {
      await recordTripException({
        tripId: state.activeTrip.id,
        exceptionType,
        exceptionDetail: exceptionDetail.trim() || null,
      });
      setShowExceptionForm(false);
      setExceptionDetail('');
      setMessage('Operational exception recorded.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not record the exception.');
    } finally {
      setRecordingException(false);
    }
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
        <PageHeader
          eyebrow={activeTrip ? 'Bus in service' : 'Driver GPS'}
          title={
            activeTrip?.bus_number_snapshot
              ? `Bus ${activeTrip.bus_number_snapshot}`
              : activeTrip
                ? 'Active bus'
                : 'Scan the bus to start'
          }
          description={
            activeTrip
              ? 'This phone is connected to the active bus tracking session.'
              : 'Scan the QR inside the bus, choose its route direction, and use this phone as the bus GPS.'
          }
        />

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
            <PlannedAssignmentsCard assignments={plannedAssignments} />
            <BusQrStartScanner hasActiveTrip={false} onStarted={handleStarted} />
          </div>
        )}

        {state.kind === 'ready' && activeTrip && (
          <div className="space-y-5" data-testid="driver-active-trip-only">
            <Card className="border-success-200 p-5 ring-1 ring-success-100">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-500">Active bus</p>
                  <h2 className="mt-1 text-2xl font-bold text-navy-900">
                    {activeTrip.bus_number_snapshot
                      ? `Bus ${activeTrip.bus_number_snapshot}`
                      : 'Active bus'}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    {activeTrip.trip_name_snapshot ?? 'Prepared run'}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Started {formatTimestamp(activeTrip.started_at)}
                  </p>
                </div>
                <StatusPill tone={isPaused ? 'neutral' : 'success'}>{activeTrip.status}</StatusPill>
              </div>

              {preTripConfirmed && (
                <div
                  className="mt-4 flex items-center gap-2 rounded-lg bg-success-50 p-3 text-sm font-semibold text-success-700"
                  data-testid="pre-trip-confirmed-badge"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Pre-trip inspection confirmed
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <DriverLocationStatus
                  supported={tracking.location.supported}
                  state={tracking.location.state}
                  compact
                />
              </div>

              {/* Phase 6: pre-trip confirmation + record exception */}
              {(isActive || isPaused) && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={preTripConfirmed ? 'secondary' : 'primary'}
                    loading={confirmingPreTrip}
                    disabled={preTripConfirmed}
                    leftIcon={<ShieldCheck className="h-5 w-5" />}
                    onClick={() => void handleConfirmPreTrip()}
                    data-testid="driver-confirm-pre-trip"
                  >
                    {preTripConfirmed ? 'Pre-trip confirmed' : 'Confirm pre-trip inspection'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<AlertTriangle className="h-5 w-5" />}
                    onClick={() => setShowExceptionForm((v) => !v)}
                    data-testid="driver-record-exception-toggle"
                  >
                    {showExceptionForm ? 'Hide exception form' : 'Record exception'}
                  </Button>
                </div>
              )}

              {showExceptionForm && (isActive || isPaused) && (
                <form
                  onSubmit={(e) => void handleRecordException(e)}
                  className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                  data-testid="driver-exception-form"
                >
                  <Field label="Exception type" htmlFor="exception-type">
                    <Select
                      id="exception-type"
                      value={exceptionType}
                      onChange={(e) => setExceptionType(e.target.value as TripExceptionType)}
                    >
                      {EXCEPTION_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Short detail (optional, max 280 chars, no student information)"
                    htmlFor="exception-detail"
                  >
                    <Textarea
                      id="exception-detail"
                      rows={3}
                      maxLength={280}
                      value={exceptionDetail}
                      onChange={(e) => setExceptionDetail(e.target.value)}
                      placeholder="e.g. held at railway crossing for 6 minutes"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={recordingException}>
                      Record exception
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowExceptionForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  leftIcon={<ClipboardCheck className="h-5 w-5" />}
                  onClick={() => navigate('/driver/pickup-drop-off')}
                >
                  Pickup & drop-off
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="danger"
                  leftIcon={<Bus className="h-5 w-5" />}
                  onClick={() => setConfirmEndOpen(true)}
                >
                  End trip
                </Button>
              </div>

              {/* Phase 6: pause / resume / cancel */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {isActive && (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={pausing}
                    leftIcon={<Pause className="h-5 w-5" />}
                    onClick={() => void handlePauseTrip()}
                    data-testid="driver-pause-trip"
                  >
                    Pause trip
                  </Button>
                )}
                {isPaused && (
                  <Button
                    type="button"
                    variant="primary"
                    loading={resuming}
                    leftIcon={<Play className="h-5 w-5" />}
                    onClick={() => void handleResumeTrip()}
                    data-testid="driver-resume-trip"
                  >
                    Resume trip
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  loading={cancelling}
                  leftIcon={<Square className="h-5 w-5" />}
                  onClick={() => setConfirmCancelOpen(true)}
                  data-testid="driver-cancel-trip"
                >
                  Cancel trip
                </Button>
              </div>
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

      <ConfirmDialog
        open={confirmEndOpen}
        title="End this bus trip?"
        description="Location sharing and pickup/drop-off recording will stop immediately."
        confirmLabel="End trip"
        destructive
        busy={ending}
        onConfirm={() => void handleEndTrip()}
        onCancel={() => setConfirmEndOpen(false)}
      />

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancel this trip?"
        description="The trip will be marked cancelled and the reason will be recorded in the audit trail. This cannot be undone."
        confirmLabel="Cancel trip"
        destructive
        busy={cancelling}
        onConfirm={() => void handleCancelTrip()}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </DashboardLayout>
  );
}
