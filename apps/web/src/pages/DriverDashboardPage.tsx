import { useCallback, useEffect, useState } from 'react';
import { Bus, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BusQrStartScanner } from '@/components/driver/BusQrStartScanner';
import { DriverLocationStatus } from '@/components/driver/DriverLocationStatus';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDriverTracking } from '@/contexts/DriverTrackingContext';
import { endDriverTrip, fetchActiveDriverTrip } from '@/services/driverTripService';
import type { BusTrackingStartResult } from '@/services/busTrackingService';
import type { DriverTrip } from '@/types/trips';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; activeTrip: DriverTrip | null };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const tracking = useDriverTracking();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', activeTrip: await fetchActiveDriverTrip() });
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
    tracking.activateTracking(result.trackingToken);
    setState({ kind: 'ready', activeTrip: result.trip });
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
      setState({ kind: 'ready', activeTrip: null });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not end this trip.');
    } finally {
      setEnding(false);
    }
  }

  const activeTrip = state.kind === 'ready' ? state.activeTrip : null;

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
              : 'Scan the QR inside the bus. SafeBus will start its prepared run and use this phone as the bus GPS.'
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
          <BusQrStartScanner hasActiveTrip={false} onStarted={handleStarted} />
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
                <StatusPill tone="success">active</StatusPill>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <DriverLocationStatus
                  supported={tracking.location.supported}
                  state={tracking.location.state}
                  compact
                />
              </div>
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
            </Card>

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
    </DashboardLayout>
  );
}
