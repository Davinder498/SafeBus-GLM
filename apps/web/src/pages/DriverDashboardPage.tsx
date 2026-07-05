import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import {
  endDriverTrip,
  fetchActiveDriverTrip,
  fetchDriverTripContext,
  startDriverTrip,
} from '@/services/driverTripService';
import type { DriverTrip, DriverTripContext, TripType } from '@/types/trips';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; context: DriverTripContext; activeTrip: DriverTrip | null };

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

  // Form state for starting a trip.
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [tripType, setTripType] = useState<TripType>('morning');

  // Action feedback.
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setState({ kind: 'loading' });
    setActionError(null);
    setSuccessMessage(null);
    try {
      const [context, activeTrip] = await Promise.all([
        fetchDriverTripContext(),
        fetchActiveDriverTrip(),
      ]);
      setState({ kind: 'ready', context, activeTrip });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load your driver dashboard.';
      setState({ kind: 'error', message });
    }
  }, []);

  /**
   * Refresh the dashboard data (context + active trip) WITHOUT clearing the
   * action success/error messages. Used after start/end so the user still sees
   * "Trip started." / "Trip ended." while the active-trip card updates.
   * Only flips to the loading state if we don't already have a ready state.
   */
  const refreshDashboard = useCallback(async () => {
    try {
      const [context, activeTrip] = await Promise.all([
        fetchDriverTripContext(),
        fetchActiveDriverTrip(),
      ]);
      setState({ kind: 'ready', context, activeTrip });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not refresh your driver dashboard.';
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const context = state.kind === 'ready' ? state.context : null;
  const activeTrip = state.kind === 'ready' ? state.activeTrip : null;

  // Resolve bus/route summaries for the active trip from the loaded context.
  const activeBus = useMemo(() => {
    if (!context || !activeTrip) return null;
    return context.buses.find((bus) => bus.id === activeTrip.bus_id) ?? null;
  }, [context, activeTrip]);

  const activeRoute = useMemo(() => {
    if (!context || !activeTrip) return null;
    return context.routes.find((route) => route.id === activeTrip.route_id) ?? null;
  }, [context, activeTrip]);

  const canStartTrip = useMemo(() => {
    if (!context || !context.driver || activeTrip) return false;
    if (context.buses.length === 0 || context.routes.length === 0) return false;
    return selectedBusId !== '' && selectedRouteId !== '';
  }, [context, activeTrip, selectedBusId, selectedRouteId]);

  async function handleStartTrip() {
    if (!canStartTrip) return;
    setActionInProgress(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await startDriverTrip({
        busId: selectedBusId,
        routeId: selectedRouteId,
        tripType,
      });
      setSelectedBusId('');
      setSelectedRouteId('');
      setSuccessMessage('Trip started. Have a safe drive.');
      // Silent refresh: updates the active-trip card WITHOUT clearing the
      // success message we just set.
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
      // Silent refresh so the success message stays visible while the
      // dashboard flips back to the start-trip card.
      await refreshDashboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not end the trip.');
    } finally {
      setActionInProgress(false);
    }
  }

  const driverName = profile?.full_name ?? 'Driver';

  return (
    <DashboardLayout title="Driver Dashboard" portal="driver" navItems={['Today']}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Today"
          title="Driver Dashboard"
          description="Start and end your trip for today. Choose a bus and route available in your organization."
        />

        {state.kind === 'loading' && <DataState title="Loading your dashboard" message="Checking your driver profile and active trip..." />}

        {state.kind === 'error' && (
          <div className="space-y-4">
            <DataState title="Could not load your dashboard" message={state.message} />
            <Button type="button" variant="secondary" onClick={() => void loadDashboard()}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && !state.context.driver && (
          <DataState
            title="Your driver profile is not set up"
            message="Ask an administrator to create your driver record before you can start a trip."
          />
        )}

        {state.kind === 'ready' && state.context.driver && (
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

            {state.activeTrip ? (
              <ActiveTripCard
                trip={state.activeTrip}
                busNumber={activeBus?.bus_number ?? null}
                routeName={activeRoute?.route_name ?? null}
                onEnd={handleEndTrip}
                actionInProgress={actionInProgress}
              />
            ) : (
              <StartTripCard
                driverName={driverName}
                buses={state.context.buses}
                routes={state.context.routes}
                selectedBusId={selectedBusId}
                selectedRouteId={selectedRouteId}
                tripType={tripType}
                onSelectBus={setSelectedBusId}
                onSelectRoute={setSelectedRouteId}
                onChangeTripType={setTripType}
                onStart={handleStartTrip}
                canStart={canStartTrip}
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

interface StartTripCardProps {
  driverName: string;
  buses: DriverTripContext['buses'];
  routes: DriverTripContext['routes'];
  selectedBusId: string;
  selectedRouteId: string;
  tripType: TripType;
  onSelectBus: (id: string) => void;
  onSelectRoute: (id: string) => void;
  onChangeTripType: (type: TripType) => void;
  onStart: () => void;
  canStart: boolean;
  actionInProgress: boolean;
}

function StartTripCard({
  driverName,
  buses,
  routes,
  selectedBusId,
  selectedRouteId,
  tripType,
  onSelectBus,
  onSelectRoute,
  onChangeTripType,
  onStart,
  canStart,
  actionInProgress,
}: StartTripCardProps) {
  const hasBuses = buses.length > 0;
  const hasRoutes = routes.length > 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-500">Signed in as</p>
        <p className="mt-1 text-lg font-bold text-navy-900">{driverName}</p>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold text-navy-900">Start a trip</h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose a bus and route available in your organization, select a trip type, then start the trip.
        </p>

        {!hasBuses && (
          <p className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
            No buses are available in your organization right now. Ask an administrator to add a bus.
          </p>
        )}
        {!hasRoutes && (
          <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
            No routes are available in your organization right now. Ask an administrator to add a route.
          </p>
        )}

        {hasBuses && (
          <div className="mt-4">
            <label
              htmlFor="trip-bus-select"
              className="block text-sm font-semibold text-gray-700"
            >
              Bus
            </label>
            <select
              id="trip-bus-select"
              value={selectedBusId}
              onChange={(event) => onSelectBus(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-navy-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500"
            >
              <option value="" disabled>
                Select a bus
              </option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  Bus {bus.bus_number}
                  {bus.license_plate ? ` (${bus.license_plate})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasRoutes && (
          <div className="mt-4">
            <label
              htmlFor="trip-route-select"
              className="block text-sm font-semibold text-gray-700"
            >
              Route
            </label>
            <select
              id="trip-route-select"
              value={selectedRouteId}
              onChange={(event) => onSelectRoute(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-navy-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500"
            >
              <option value="" disabled>
                Select a route
              </option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.route_name} ({route.route_code})
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset className="mt-4" aria-labelledby="trip-type-legend">
          <legend id="trip-type-legend" className="text-sm font-semibold text-gray-700">
            Trip type
          </legend>
          <div
            role="radiogroup"
            aria-labelledby="trip-type-legend"
            className="mt-2 flex gap-3"
          >
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-navy-900 has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50">
              <input
                type="radio"
                name="trip-type"
                value="morning"
                checked={tripType === 'morning'}
                onChange={() => onChangeTripType('morning')}
                className="h-4 w-4 text-navy-700"
              />
              Morning
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-navy-900 has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50">
              <input
                type="radio"
                name="trip-type"
                value="evening"
                checked={tripType === 'evening'}
                onChange={() => onChangeTripType('evening')}
                className="h-4 w-4 text-navy-700"
              />
              Evening
            </label>
          </div>
        </fieldset>
      </Card>

      <Button
        type="button"
        size="lg"
        fullWidth
        onClick={onStart}
        disabled={!canStart || actionInProgress}
      >
        {actionInProgress ? 'Starting trip...' : 'Start Trip'}
      </Button>
    </div>
  );
}
