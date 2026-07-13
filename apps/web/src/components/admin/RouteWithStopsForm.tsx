import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { School } from '@/types/organization';
import type { AssignmentStatus } from '@/types/driverAssignments';
import type { TripType } from '@/types/trips';
import type {
  Bus,
  CreateRouteInput,
  Driver,
  Route,
  RouteStatus,
  RouteStop,
  RouteStopStatus,
  RouteType,
  UpdateRouteInput,
} from '@/types/transportation';

type SubmitState = 'idle' | 'saving';

const fieldClassName = 'mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base';
const labelClassName = 'block text-sm font-semibold text-gray-700';

export interface StopDraft {
  id?: string;
  school_id: string | null;
  stop_name: string;
  stop_order: number;
  planned_arrival_time: string | null;
  status: RouteStopStatus;
  isNew?: boolean;
}

export interface AssignmentDraft {
  id: string;
  driverId: string;
  busId: string;
  tripType: TripType;
  status: AssignmentStatus;
}

export interface RouteWithStopsSubmitPayload {
  route: CreateRouteInput | UpdateRouteInput;
  stops: StopDraft[];
  assignments: AssignmentDraft[];
  removedAssignmentIds: string[];
}

interface RouteWithStopsFormProps {
  route: Route | null;
  existingStops: RouteStop[];
  existingAssignments: AssignmentDraft[];
  /**
   * Routes already visible to the user, used to detect duplicate route codes
   * within the same tenant before submitting.
   */
  existingRoutes: Route[];
  schools: School[];
  buses: Bus[];
  drivers: Driver[];
  profileLabels: Map<string, string>;
  defaultTenantId: string | null;
  onSubmit: (payload: RouteWithStopsSubmitPayload) => Promise<void>;
  onCancel: () => void;
}

function getSchoolTenantId(schools: School[], schoolId: string | null): string | null {
  if (!schoolId) return null;
  return schools.find((school) => school.id === schoolId)?.tenant_id ?? null;
}

export function RouteWithStopsForm({
  route,
  existingStops,
  existingAssignments,
  existingRoutes,
  schools,
  buses,
  drivers,
  profileLabels,
  defaultTenantId,
  onSubmit,
  onCancel,
}: RouteWithStopsFormProps) {
  const [routeName, setRouteName] = useState(route?.route_name ?? '');
  const [routeCode, setRouteCode] = useState(route?.route_code ?? '');
  const [routeType, setRouteType] = useState<RouteType>(route?.route_type ?? 'morning');
  const [schoolId, setSchoolId] = useState(route?.school_id ?? '');
  const [status, setStatus] = useState<RouteStatus>(route?.status ?? 'active');

  const [stops, setStops] = useState<StopDraft[]>(() =>
    existingStops
      .filter((s) => s.status !== 'archived')
      .sort((a, b) => a.stop_order - b.stop_order)
      .map((s) => ({
        id: s.id,
        school_id: s.school_id,
        stop_name: s.stop_name,
        stop_order: s.stop_order,
        planned_arrival_time: s.planned_arrival_time?.slice(0, 5) ?? null,
        status: s.status,
        isNew: false,
      })),
  );

  const [assignments, setAssignments] = useState<AssignmentDraft[]>(existingAssignments);
  const [removedAssignmentIds, setRemovedAssignmentIds] = useState<string[]>([]);

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignBusId, setAssignBusId] = useState('');
  const [assignTripType, setAssignTripType] = useState<TripType>('morning');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  const activeBuses = useMemo(() => buses.filter((b) => b.status === 'active'), [buses]);
  const activeDrivers = useMemo(() => drivers.filter((d) => d.status === 'active'), [drivers]);

  // Add a new blank stop row with auto-incremented order
  function handleAddStop() {
    setStops((prev) => [
      ...prev,
      {
        school_id: null,
        stop_name: '',
        stop_order: prev.length + 1,
        planned_arrival_time: null,
        status: 'active',
        isNew: true,
      },
    ]);
  }

  function handleStopChange(index: number, field: keyof StopDraft, value: string) {
    setStops((prev) => {
      const next = [...prev];
      const stop = { ...next[index] };
      if (field === 'stop_order') {
        stop.stop_order = Number(value) || 0;
      } else if (field === 'planned_arrival_time') {
        stop.planned_arrival_time = value || null;
      } else {
        // stop_name
        (stop as Record<string, unknown>)[field] = value;
      }
      next[index] = stop;
      return next;
    });
  }

  function handleRemoveStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddAssignment() {
    if (!assignDriverId || !assignBusId) {
      setFormError('Driver and bus are required to assign.');
      return;
    }
    setAssignments((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        driverId: assignDriverId,
        busId: assignBusId,
        tripType: assignTripType,
        status: 'active',
      },
    ]);
    setShowAssignForm(false);
    setAssignDriverId('');
    setAssignBusId('');
    setAssignTripType('morning');
    setFormError(null);
  }

  function handleRemoveAssignment(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    // Track removed existing assignments for deactivation
    if (!id.startsWith('new-')) {
      setRemovedAssignmentIds((prev) => [...prev, id]);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const tenantId = route?.tenant_id ?? getSchoolTenantId(schools, schoolId || null) ?? defaultTenantId;

    if (!tenantId) {
      setFormError('Use an account with a tenant before saving this route.');
      return;
    }

    if (!routeName.trim() || !routeCode.trim()) {
      setFormError('Route name and route code are required.');
      return;
    }

    // Per-tenant uniqueness check on route_code. The DB enforces this via
    // routes_tenant_route_code_unique; this avoids the round-trip and surfaces
    // a clear message before submitting. We compare case-insensitively and
    // ignore the route currently being edited.
    const normalizedCode = routeCode.trim().toLowerCase();
    const duplicateCodeRoute = existingRoutes.find(
      (existing) =>
        existing.route_code.trim().toLowerCase() === normalizedCode &&
        (!route || existing.id !== route.id),
    );
    if (duplicateCodeRoute) {
      setFormError(
        `Route code "${routeCode.trim()}" is already used by "${duplicateCodeRoute.route_name}". Use a different code.`,
      );
      return;
    }

    // Validate stops: name required, order must be positive
    const seenOrders = new Set<number>();
    for (const stop of stops) {
      if (!stop.stop_name.trim()) {
        setFormError('Each stop must have a name.');
        return;
      }
      if (!Number.isInteger(stop.stop_order) || stop.stop_order <= 0) {
        setFormError('Stop order must be a whole number greater than zero.');
        return;
      }
      if (seenOrders.has(stop.stop_order)) {
        setFormError(`Duplicate stop order ${stop.stop_order}. Each stop needs a unique order.`);
        return;
      }
      seenOrders.add(stop.stop_order);
    }

    const routeInput: CreateRouteInput | UpdateRouteInput = route
      ? {
          school_id: schoolId || null,
          route_name: routeName.trim(),
          route_code: routeCode.trim(),
          route_type: routeType,
          status,
        }
      : {
          tenant_id: tenantId,
          school_id: schoolId || null,
          route_name: routeName.trim(),
          route_code: routeCode.trim(),
          route_type: routeType,
          status,
        };

    setSubmitState('saving');
    try {
      await onSubmit({
        route: routeInput,
        stops,
        assignments,
        removedAssignmentIds,
      });
    } catch (submitError) {
      setFormError(
        submitError instanceof Error ? submitError.message : 'Unable to save route.',
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      {formError && (
        <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
          {formError}
        </p>
      )}

      {/* Route Details Section */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-base font-bold text-navy-900">Route details</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClassName}>
            Route name
            <input
              className={fieldClassName}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="e.g., Morning Route 12"
            />
          </label>
          <label className={labelClassName}>
            Route code
            <input
              className={fieldClassName}
              value={routeCode}
              onChange={(e) => setRouteCode(e.target.value)}
              placeholder="e.g., MR-12"
            />
          </label>
          <label className={labelClassName}>
            Route type
            <select
              className={fieldClassName}
              value={routeType}
              onChange={(e) => setRouteType(e.target.value as RouteType)}
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="special">Special</option>
              <option value="field_trip">Field trip</option>
            </select>
          </label>
          <label className={labelClassName}>
            Primary school (optional)
            <select
              className={fieldClassName}
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              <option value="">No school selected</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Status
            <select
              className={fieldClassName}
              value={status}
              onChange={(e) => setStatus(e.target.value as RouteStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </section>

      {/* Stops Section */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-navy-900">
            Stops <span className="text-sm font-normal text-gray-500">({stops.length})</span>
          </h3>
          <Button type="button" variant="secondary" size="sm" onClick={handleAddStop}>
            Add stop
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Add the ordered pickup and drop-off stops for this route. Estimated times are optional.
        </p>

        {stops.length === 0 ? (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No stops yet. Click &ldquo;Add stop&rdquo; to begin.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {stops.map((stop, index) => (
              <div
                key={stop.id ?? `new-${index}`}
                className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[60px_1fr_160px_120px_auto]"
              >
                <label className="text-xs font-semibold text-gray-600">
                  Order
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                    value={stop.stop_order}
                    onChange={(e) => handleStopChange(index, 'stop_order', e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  School stop (optional)
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                    value={stop.school_id ?? ''}
                    onChange={(e) => handleStopChange(index, 'school_id', e.target.value)}
                  >
                    <option value="">Regular stop</option>
                    {schools.filter((school) => school.status === 'active').map((school) => (
                      <option key={school.id} value={school.id}>{school.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Stop name
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={stop.stop_name}
                    placeholder="e.g., Elm Street & 4th Ave"
                    onChange={(e) => handleStopChange(index, 'stop_name', e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Est. time
                  <input
                    type="time"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                    value={stop.planned_arrival_time ?? ''}
                    onChange={(e) =>
                      handleStopChange(index, 'planned_arrival_time', e.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveStop(index)}
                  className="self-end rounded-md px-3 py-2 text-sm font-semibold text-danger-600 hover:bg-danger-50"
                  aria-label="Remove stop"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bus Assignment Section */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-navy-900">Bus assignment</h3>
          {!showAssignForm && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAssignForm(true)}
              disabled={activeBuses.length === 0 || activeDrivers.length === 0}
            >
              Assign bus
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Assign a driver and bus to this route. Drivers start trips from these assignments.
        </p>

        {showAssignForm && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-gray-600">
                Driver
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                >
                  <option value="">Select driver</option>
                  {activeDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {profileLabels.get(driver.profile_id) ??
                        driver.employee_number ??
                        driver.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Bus
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={assignBusId}
                  onChange={(e) => setAssignBusId(e.target.value)}
                >
                  <option value="">Select bus</option>
                  {activeBuses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      Bus {bus.bus_number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Trip type
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={assignTripType}
                  onChange={(e) => setAssignTripType(e.target.value as TripType)}
                >
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" onClick={handleAddAssignment}>
                Add assignment
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowAssignForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {assignments.length === 0 && !showAssignForm ? (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-4 text-center text-sm text-gray-500">
            No bus assigned yet. This route can&rsquo;t start trips until a bus and driver are
            assigned.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <div className="text-sm">
                  <span className="font-semibold text-navy-900">
                    {activeBuses.find((b) => b.id === a.busId)
                      ? `Bus ${activeBuses.find((b) => b.id === a.busId)?.bus_number}`
                      : 'Bus removed'}
                  </span>
                  <span className="ml-2 text-gray-500">
                    {profileLabels.get(
                      activeDrivers.find((d) => d.id === a.driverId)?.profile_id ?? '',
                    ) ?? 'Driver'}{' '}
                    &middot; {a.tripType}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAssignment(a.id)}
                  className="text-sm font-semibold text-danger-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Submit */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>
          {submitState === 'saving' ? 'Saving' : 'Save route'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
