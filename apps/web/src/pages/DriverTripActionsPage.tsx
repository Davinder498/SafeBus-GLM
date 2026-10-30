import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, Bus, Pause, Play, ShieldCheck, Square } from 'lucide-react';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { DriverActionCard } from '@/components/driver/DriverActionCard';
import { DriverConfirmationDialog } from '@/components/driver/DriverConfirmationDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
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
import {
  confirmPreTrip,
  getPreTripConfirmation,
  operationalTextContainsProhibitedInformation,
  recordTripException,
} from '@/services/phase6OperationsService';
import { TRIP_EXCEPTION_TYPES, type TripExceptionType } from '@/types/tripExceptions';
import type { DriverTrip } from '@/types/trips';

const TRIP_ACTIONS = {
  pause: {
    label: 'Pause trip',
    title: 'Pause this trip?',
    consequence: 'Location sharing will stop until you resume the trip.',
    success: 'Trip paused. Location sharing stopped until the trip resumes.',
    icon: Pause,
  },
  resume: {
    label: 'Resume trip',
    title: 'Resume this trip?',
    consequence:
      'Location sharing will restart on this phone. Location permission and an active bus tracking session are required.',
    success: 'Trip resumed.',
    icon: Play,
  },
  end: {
    label: 'End trip',
    title: 'End this bus trip?',
    consequence: 'Location sharing and pickup/drop-off recording will stop immediately.',
    success: 'Trip ended. Location sharing stopped.',
    icon: Bus,
  },
  cancel: {
    label: 'Cancel trip',
    title: 'Cancel this trip?',
    consequence:
      'Location sharing and pickup/drop-off recording will stop. The cancellation and optional reason will be recorded. This cannot be undone.',
    success: 'Trip cancelled and recorded in the audit trail.',
    icon: Square,
  },
  pretrip: {
    label: 'Confirm pre-trip inspection',
    title: 'Confirm pre-trip inspection?',
    consequence: 'Confirm that you have completed the pre-trip inspection for this bus.',
    success: 'Pre-trip inspection confirmed and recorded.',
    icon: ShieldCheck,
  },
} as const;
type TripAction = keyof typeof TRIP_ACTIONS;
type Selection =
  | { kind: 'action'; value: TripAction }
  | { kind: 'exception'; value: TripExceptionType; label: string };
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; trip: DriverTrip | null; preTripConfirmed: boolean };

function DriverOperationPage({ exceptions }: { exceptions: boolean }) {
  const navigate = useNavigate();
  const tracking = useDriverTracking();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const trip = await fetchActiveDriverTrip();
        const confirmation = trip && !exceptions ? await getPreTripConfirmation(trip.id) : null;
        if (current) setState({ kind: 'ready', trip, preTripConfirmed: confirmation !== null });
      } catch (cause) {
        if (current)
          setState({
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Could not load the active trip.',
          });
      }
    })();
    return () => {
      current = false;
    };
  }, [exceptions, loadVersion]);

  const trip = state.kind === 'ready' ? state.trip : null;
  const busLabel = trip?.bus_number_snapshot ? `Bus ${trip.bus_number_snapshot}` : 'Active bus';
  const action = selection?.kind === 'action' ? TRIP_ACTIONS[selection.value] : null;
  const title = exceptions ? 'Record exception' : 'Trip actions';

  function choose(next: Selection) {
    setSelection(next);
    setDetail('');
    setError(null);
    setStale(false);
  }

  const close = useCallback(() => {
    if (pending.current) return;
    setSelection(null);
    setError(null);
  }, []);

  async function submit() {
    if (!selection || !trip || pending.current || stale) return;
    const text = detail.trim();
    const maxLength = selection.kind === 'exception' ? 280 : 120;
    if (text.length > maxLength || operationalTextContainsProhibitedInformation(text)) {
      setError(
        text.length > maxLength
          ? `Use no more than ${maxLength} characters.`
          : 'The detail contains prohibited student information.',
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const currentTrip = await fetchActiveDriverTrip();
      if (!mounted.current) return;
      if (
        !currentTrip ||
        currentTrip.id !== trip.id ||
        currentTrip.status !== trip.status ||
        !['active', 'paused'].includes(currentTrip.status)
      ) {
        setStale(true);
        throw new Error(
          'This trip has changed or ended. Go back to the active bus to refresh before recording an action.',
        );
      }
      let message: string;
      if (selection.kind === 'exception') {
        await recordTripException({
          tripId: trip.id,
          exceptionType: selection.value,
          exceptionDetail: text || null,
        });
        message = 'Operational exception recorded.';
      } else {
        switch (selection.value) {
          case 'pause':
            await pauseDriverTrip(trip.id);
            tracking.location.stop();
            break;
          case 'resume':
            await resumeDriverTrip(trip.id);
            tracking.location.start();
            break;
          case 'end':
            await endDriverTrip(trip.id);
            tracking.clearTracking();
            break;
          case 'cancel':
            await cancelDriverTrip(trip.id, text || null);
            tracking.clearTracking();
            break;
          case 'pretrip':
            await confirmPreTrip(trip.id);
            break;
        }
        message = TRIP_ACTIONS[selection.value].success;
      }
      if (mounted.current)
        navigate('/driver', { replace: true, state: { driverTripMessage: message } });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : 'Could not save this action. Please try again.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const actions: TripAction[] = trip
    ? [
        trip.status === 'paused' ? 'resume' : 'pause',
        'end',
        'cancel',
        ...(state.kind === 'ready' && !state.preTripConfirmed ? ['pretrip' as const] : []),
      ]
    : [];

  return (
    <DashboardLayout title={title} portal="driver" navItems={[]} navGroups={driverNavGroups}>
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/driver"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-navy-700"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden /> Back to active bus
        </Link>
        <PageHeader title={title} />
        {state.kind === 'loading' && (
          <DataState title="Loading active trip" message="Checking the current bus trip." />
        )}
        {state.kind === 'error' && (
          <>
            <DataState title="Could not load the active trip" message={state.message} />
            <Button onClick={() => setLoadVersion((version) => version + 1)}>Try again</Button>
          </>
        )}
        {state.kind === 'ready' && !trip && (
          <DataState
            title="No active bus trip"
            message="Return to the driver dashboard to scan a bus and start a trip."
          />
        )}
        {trip && (
          <>
            <Card className="p-5" data-testid="driver-action-trip-context">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-navy-900">{busLabel}</h2>
                <StatusPill tone={trip.status === 'paused' ? 'neutral' : 'success'}>
                  {trip.status}
                </StatusPill>
              </div>
              <p className="mt-2 font-semibold text-slate-700">
                {trip.trip_name_snapshot ?? 'Prepared run'}
              </p>
            </Card>
            <div
              className="grid gap-3 sm:grid-cols-2"
              data-testid={exceptions ? 'driver-exception-types' : 'driver-trip-action-cards'}
            >
              {exceptions
                ? TRIP_EXCEPTION_TYPES.map((option) => (
                    <DriverActionCard
                      key={option.value}
                      label={option.label}
                      icon={<AlertTriangle className="h-6 w-6" />}
                      onClick={() => choose({ kind: 'exception', ...option })}
                    />
                  ))
                : actions.map((value) => {
                    const { label, icon: Icon } = TRIP_ACTIONS[value];
                    return (
                      <DriverActionCard
                        key={value}
                        label={label}
                        icon={<Icon className="h-6 w-6" />}
                        destructive={value === 'end' || value === 'cancel'}
                        testId={`driver-${value === 'pretrip' ? 'confirm-pre' : value}-trip`}
                        onClick={() => choose({ kind: 'action', value })}
                      />
                    );
                  })}
            </div>
          </>
        )}
      </div>
      {selection && trip && (
        <DriverConfirmationDialog
          title={
            action?.title ??
            `Record ${selection.kind === 'exception' ? selection.label.toLowerCase() : 'exception'}?`
          }
          confirmLabel={action?.label ?? 'Record exception'}
          busy={busy}
          confirmDisabled={stale}
          destructive={
            selection.kind === 'action' &&
            (selection.value === 'end' || selection.value === 'cancel')
          }
          onConfirm={() => void submit()}
          onCancel={close}
        >
          <p className="font-semibold text-navy-900">
            {busLabel} · {trip.trip_name_snapshot ?? 'Prepared run'}
          </p>
          {action && <p className="text-sm text-slate-600">{action.consequence}</p>}
          {(selection.kind === 'exception' || selection.value === 'cancel') && (
            <Field
              label={
                selection.kind === 'exception'
                  ? 'Short detail (optional, max 280 chars, no student information)'
                  : 'Reason (optional, max 120 chars, no student information)'
              }
              htmlFor="driver-action-detail"
            >
              <Textarea
                id="driver-action-detail"
                rows={3}
                maxLength={selection.kind === 'exception' ? 280 : 120}
                value={detail}
                disabled={busy}
                onChange={(event) => setDetail(event.target.value)}
              />
            </Field>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm font-semibold text-danger-700"
            >
              {error}
            </p>
          )}
          {stale && (
            <Link
              to="/driver"
              className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline"
            >
              Back to active bus
            </Link>
          )}
        </DriverConfirmationDialog>
      )}
    </DashboardLayout>
  );
}

export function DriverTripActionsPage() {
  return <DriverOperationPage exceptions={false} />;
}
export function DriverTripExceptionPage() {
  return <DriverOperationPage exceptions />;
}
