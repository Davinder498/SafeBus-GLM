import { useState, type FormEvent } from 'react';
import { RouteStopMapEditor } from '@/components/admin/RouteStopMapEditor';
import { Button } from '@/components/ui/Button';
import { mapTileConfig } from '@/config/mapTiles';
import type { School } from '@/types/organization';
import type {
  Route,
  RouteDefinitionStopInput,
  RouteDefinitionTripInput,
  RouteKind,
  RouteStatus,
  RouteStop,
  RouteTripPattern,
  RouteTripStopSchedule,
  SaveRouteDefinitionInput,
} from '@/types/transportation';
import {
  chooseRouteColor,
  normalizeStopOrders,
  ROUTE_COLOR_PALETTE,
  routeDefinitionIssue,
} from '@/utils/routeDefinition';

type SubmitState = 'idle' | 'saving';

const fieldClassName = 'mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base';
const labelClassName = 'block text-sm font-semibold text-gray-700';

interface RouteWithStopsFormProps {
  route: Route | null;
  existingStops: RouteStop[];
  existingTripPatterns: RouteTripPattern[];
  existingSchedules: RouteTripStopSchedule[];
  existingRoutes: Route[];
  schools: School[];
  onSubmit(payload: SaveRouteDefinitionInput): Promise<void>;
  onCancel(): void;
}

function stopClientKey(stop: RouteStop): string {
  return `stop-${stop.id}`;
}

function initialTrip(
  direction: 'forward' | 'reverse',
  existingTripPatterns: RouteTripPattern[],
  existingStops: RouteStop[],
  existingSchedules: RouteTripStopSchedule[],
): RouteDefinitionTripInput {
  const pattern = existingTripPatterns.find((item) => item.direction === direction);
  const stopTimes: Record<string, string | null> = {};
  for (const stop of existingStops) {
    const schedule = existingSchedules.find(
      (item) =>
        item.route_trip_pattern_id === pattern?.id && item.route_stop_id === stop.id,
    );
    stopTimes[stopClientKey(stop)] = schedule?.planned_arrival_time?.slice(0, 5) ?? null;
  }
  return {
    id: pattern?.id,
    direction,
    displayName: pattern?.display_name ?? (direction === 'forward' ? 'Outbound' : 'Return'),
    status: pattern?.status ?? 'active',
    stopTimes,
  };
}

export function RouteWithStopsForm({
  route,
  existingStops,
  existingTripPatterns,
  existingSchedules,
  existingRoutes,
  schools,
  onSubmit,
  onCancel,
}: RouteWithStopsFormProps) {
  const [routeName, setRouteName] = useState(route?.route_name ?? '');
  const [routeCode, setRouteCode] = useState(route?.route_code ?? '');
  const [routeKind, setRouteKind] = useState<RouteKind>(route?.route_kind ?? 'regular');
  const [mapColor, setMapColor] = useState(
    route?.map_color ?? chooseRouteColor(existingRoutes, route?.id),
  );
  const [schoolId, setSchoolId] = useState(route?.school_id ?? '');
  const [status, setStatus] = useState<RouteStatus>(route?.status ?? 'inactive');
  const [stops, setStops] = useState<RouteDefinitionStopInput[]>(() =>
    existingStops
      .filter((stop) => stop.status !== 'archived')
      .sort((a, b) => a.stop_order - b.stop_order)
      .map((stop) => ({
        id: stop.id,
        clientKey: stopClientKey(stop),
        schoolId: stop.school_id,
        stopName: stop.stop_name,
        stopOrder: stop.stop_order,
        latitude: stop.latitude,
        longitude: stop.longitude,
        status: stop.status === 'inactive' ? 'inactive' : 'active',
      })),
  );
  const [trips, setTrips] = useState<[RouteDefinitionTripInput, RouteDefinitionTripInput]>(
    () => [
      initialTrip('forward', existingTripPatterns, existingStops, existingSchedules),
      initialTrip('reverse', existingTripPatterns, existingStops, existingSchedules),
    ],
  );
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(
    stops[0]?.clientKey ?? null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const unavailableColors = new Set(
    existingRoutes
      .filter((item) => item.id !== route?.id && item.status === 'active')
      .map((item) => item.map_color?.toUpperCase())
      .filter((color): color is string => Boolean(color)),
  );

  function updateTrip(
    direction: 'forward' | 'reverse',
    patch: Partial<RouteDefinitionTripInput>,
  ) {
    setTrips((previous) =>
      previous.map((trip) =>
        trip.direction === direction ? { ...trip, ...patch } : trip,
      ) as [RouteDefinitionTripInput, RouteDefinitionTripInput],
    );
  }

  function updateStop(clientKey: string, patch: Partial<RouteDefinitionStopInput>) {
    setStops((previous) =>
      previous.map((stop) => (stop.clientKey === clientKey ? { ...stop, ...patch } : stop)),
    );
  }

  function addStop() {
    const clientKey = `new-${crypto.randomUUID()}`;
    setStops((previous) => [
      ...previous,
      {
        clientKey,
        schoolId: null,
        stopName: '',
        stopOrder: previous.length + 1,
        latitude: null,
        longitude: null,
        status: 'active',
      },
    ]);
    setSelectedStopKey(clientKey);
  }

  function removeStop(clientKey: string) {
    setStops((previous) => normalizeStopOrders(previous.filter((s) => s.clientKey !== clientKey)));
    setTrips((previous) =>
      previous.map((trip) => {
        const stopTimes = { ...trip.stopTimes };
        delete stopTimes[clientKey];
        return { ...trip, stopTimes };
      }) as [RouteDefinitionTripInput, RouteDefinitionTripInput],
    );
    if (selectedStopKey === clientKey) setSelectedStopKey(null);
  }

  function moveStop(index: number, delta: -1 | 1) {
    const destination = index + delta;
    if (destination < 0 || destination >= stops.length) return;
    setStops((previous) => {
      const next = [...previous];
      [next[index], next[destination]] = [next[destination], next[index]];
      return normalizeStopOrders(next);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!routeName.trim() || !routeCode.trim()) {
      setFormError('Route name and route code are required.');
      return;
    }
    const duplicateCode = existingRoutes.find(
      (item) =>
        item.id !== route?.id &&
        item.route_code.trim().toLowerCase() === routeCode.trim().toLowerCase(),
    );
    if (duplicateCode) {
      setFormError(`Route code "${routeCode.trim()}" is already in use.`);
      return;
    }
    if (trips.some((trip) => !trip.displayName.trim())) {
      setFormError('Forward and reverse trips both need a name.');
      return;
    }
    if (status === 'active' && unavailableColors.has(mapColor.toUpperCase())) {
      setFormError('Choose a color that is not used by another active route.');
      return;
    }
    const issue = routeDefinitionIssue(stops);
    if (status === 'active' && issue) {
      setFormError(issue);
      return;
    }

    setSubmitState('saving');
    try {
      await onSubmit({
        route: {
          id: route?.id,
          schoolId: schoolId || null,
          routeName: routeName.trim(),
          routeCode: routeCode.trim(),
          routeKind,
          mapColor,
          status,
        },
        stops: normalizeStopOrders(stops),
        tripPatterns: trips.map((trip) => ({
          ...trip,
          displayName: trip.displayName.trim(),
          stopTimes: Object.fromEntries(
            stops.map((stop) => [stop.clientKey, trip.stopTimes[stop.clientKey] ?? null]),
          ),
        })),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save route.');
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      {formError && (
        <p role="alert" className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
          {formError}
        </p>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-base font-bold text-navy-900">Route corridor</h3>
        <p className="mt-1 text-sm text-gray-600">
          The stop sequence defines one physical corridor from its first stop to its last.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClassName}>
            Route name
            <input className={fieldClassName} value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Route 1" />
          </label>
          <label className={labelClassName}>
            Route code
            <input className={fieldClassName} value={routeCode} onChange={(e) => setRouteCode(e.target.value)} placeholder="R-1" />
          </label>
          <label className={labelClassName}>
            Route kind
            <select className={fieldClassName} value={routeKind} onChange={(e) => setRouteKind(e.target.value as RouteKind)}>
              <option value="regular">Regular service</option>
              <option value="field_trip">Field trip</option>
            </select>
          </label>
          <label className={labelClassName}>
            Primary school (optional)
            <select className={fieldClassName} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">No school selected</option>
              {schools.filter((school) => school.status === 'active').map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className={labelClassName}>Map color</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROUTE_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`h-9 w-9 rounded-full border-4 ${mapColor === color ? 'border-navy-900' : 'border-white'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`${unavailableColors.has(color) ? 'Route color in use' : 'Use route color'} ${color}`}
                  aria-pressed={mapColor === color}
                  disabled={unavailableColors.has(color)}
                  onClick={() => setMapColor(color)}
                />
              ))}
            </div>
          </fieldset>
          <label className={labelClassName}>
            Status
            <select className={fieldClassName} value={status} onChange={(e) => setStatus(e.target.value as RouteStatus)}>
              <option value="inactive">Draft / inactive</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-navy-900">Directional trips</h3>
            <p className="mt-1 text-sm text-gray-600">Names are editable; direction remains tied to the corridor.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {trips.map((trip) => (
            <div key={trip.direction} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {trip.direction === 'forward' ? 'Start → End' : 'End → Start'}
              </p>
              <label className={`${labelClassName} mt-3`}>
                Trip name
                <input className={fieldClassName} value={trip.displayName} onChange={(e) => updateTrip(trip.direction, { displayName: e.target.value })} />
              </label>
              <label className={`${labelClassName} mt-3`}>
                Status
                <select className={fieldClassName} value={trip.status} onChange={(e) => updateTrip(trip.direction, { status: e.target.value as 'active' | 'inactive' })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-navy-900">Stops ({stops.length})</h3>
            <p className="mt-1 text-sm text-gray-600">The first and last active stops are always the route terminals.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addStop}>Add stop</Button>
        </div>

        <div className="mt-4 space-y-3">
          {stops.map((stop, index) => (
            <div
              key={stop.clientKey}
              className={`rounded-lg border p-4 ${selectedStopKey === stop.clientKey ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="text-left text-sm font-bold text-navy-900" onClick={() => setSelectedStopKey(stop.clientKey)}>
                  {index === 0 ? 'Start stop' : index === stops.length - 1 ? 'End stop' : `Stop ${index + 1}`}
                </button>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => moveStop(index, -1)} disabled={index === 0}>Up</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => moveStop(index, 1)} disabled={index === stops.length - 1}>Down</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => removeStop(stop.clientKey)}>Remove</Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClassName}>
                  Stop name
                  <input className={fieldClassName} value={stop.stopName} onChange={(e) => updateStop(stop.clientKey, { stopName: e.target.value })} />
                </label>
                <label className={labelClassName}>
                  School stop (optional)
                  <select className={fieldClassName} value={stop.schoolId ?? ''} onChange={(e) => updateStop(stop.clientKey, { schoolId: e.target.value || null })}>
                    <option value="">Regular stop</option>
                    {schools.filter((school) => school.status === 'active').map((school) => (
                      <option key={school.id} value={school.id}>{school.name}</option>
                    ))}
                  </select>
                </label>
                <label className={labelClassName}>
                  Latitude
                  <input type="number" step="any" className={fieldClassName} value={stop.latitude ?? ''} onChange={(e) => updateStop(stop.clientKey, { latitude: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
                <label className={labelClassName}>
                  Longitude
                  <input type="number" step="any" className={fieldClassName} value={stop.longitude ?? ''} onChange={(e) => updateStop(stop.clientKey, { longitude: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
                {trips.map((trip) => (
                  <label key={trip.direction} className={labelClassName}>
                    {trip.displayName || trip.direction} time
                    <input
                      type="time"
                      className={fieldClassName}
                      value={trip.stopTimes[stop.clientKey] ?? ''}
                      onChange={(e) => updateTrip(trip.direction, {
                        stopTimes: { ...trip.stopTimes, [stop.clientKey]: e.target.value || null },
                      })}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {stops.length === 0 && (
            <p className="rounded-lg bg-gray-50 p-5 text-center text-sm text-gray-600">Add the start stop to begin defining this corridor.</p>
          )}
        </div>

        <div className="mt-5">
          <RouteStopMapEditor
            stops={stops}
            selectedKey={selectedStopKey}
            tileConfig={mapTileConfig}
            onSelect={setSelectedStopKey}
            onPlace={(clientKey, latitude, longitude) =>
              updateStop(clientKey, { latitude, longitude })
            }
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>
          {submitState === 'saving' ? 'Saving…' : 'Save route definition'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
