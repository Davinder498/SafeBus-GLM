import { useMemo, useState, type FormEvent } from 'react';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import { Button } from '@/components/ui/Button';
import type {
  BusServiceOption,
  SetStudentBusServiceInput,
} from '@/services/studentBusAssignmentService';
import type { DirectionScope, RouteStop, StudentBusAssignment } from '@/types/transportation';
import { directionScopeFromDirections, resolveReverseStops } from '@/utils/directionalAssignments';

type NamedStudentAssignment = StudentBusAssignment & { student_name?: string };

export function DirectionalStudentBusAssignmentForm({
  assignments = [],
  studentLabel,
  fixedStudentId,
  services,
  stops,
  onSubmit,
  onCancel,
}: {
  assignments?: NamedStudentAssignment[];
  studentLabel?: string;
  fixedStudentId?: string;
  services: BusServiceOption[];
  stops: RouteStop[];
  onSubmit: (input: SetStudentBusServiceInput) => Promise<void>;
  onCancel: () => void;
}) {
  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );
  const initialServices = assignments
    .map((assignment) => serviceById.get(assignment.bus_route_assignment_id))
    .filter((service): service is BusServiceOption => !!service);
  const initialRouteId = initialServices[0]?.route_id ?? '';
  const initialForward = assignments.find(
    (assignment) => serviceById.get(assignment.bus_route_assignment_id)?.direction === 'forward',
  );
  const initialReverse = assignments.find(
    (assignment) => serviceById.get(assignment.bus_route_assignment_id)?.direction === 'reverse',
  );

  const [studentId, setStudentId] = useState(assignments[0]?.student_id ?? fixedStudentId ?? '');
  const [routeId, setRouteId] = useState(initialRouteId);
  const [directionScope, setDirectionScope] = useState<DirectionScope>(() =>
    initialServices.length > 0
      ? directionScopeFromDirections(initialServices.map((service) => service.direction))
      : 'both',
  );
  const [forwardPickupStopId, setForwardPickupStopId] = useState(
    initialForward?.pickup_stop_id ?? '',
  );
  const [forwardDropoffStopId, setForwardDropoffStopId] = useState(
    initialForward?.dropoff_stop_id ?? '',
  );
  const [reversePickupStopId, setReversePickupStopId] = useState(
    initialReverse?.pickup_stop_id ?? initialForward?.dropoff_stop_id ?? '',
  );
  const [reverseDropoffStopId, setReverseDropoffStopId] = useState(
    initialReverse?.dropoff_stop_id ?? initialForward?.pickup_stop_id ?? '',
  );
  const [customizeReturn, setCustomizeReturn] = useState(
    !!initialReverse &&
      (initialReverse.pickup_stop_id !== initialForward?.dropoff_stop_id ||
        initialReverse.dropoff_stop_id !== initialForward?.pickup_stop_id),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    assignments[0]?.effective_from ?? new Date().toISOString().slice(0, 10),
  );
  const [effectiveTo, setEffectiveTo] = useState(assignments[0]?.effective_to ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const routeOptions = useMemo(() => {
    const options = new Map<string, BusServiceOption>();
    for (const service of services) {
      if (!options.has(service.route_id)) options.set(service.route_id, service);
    }
    return [...options.values()];
  }, [services]);
  const routeServices = services.filter((service) => service.route_id === routeId);
  const availableDirections = new Set(routeServices.map((service) => service.direction));
  const availableStops = useMemo(
    () =>
      stops
        .filter((stop) => stop.route_id === routeId && stop.status === 'active')
        .sort((a, b) => a.stop_order - b.stop_order),
    [routeId, stops],
  );

  function clearStops() {
    setForwardPickupStopId('');
    setForwardDropoffStopId('');
    setReversePickupStopId('');
    setReverseDropoffStopId('');
    setCustomizeReturn(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const busId = routeServices[0]?.bus_id;
    if (!studentId || !busId || !routeId) {
      setError('Choose a student and bus route.');
      return;
    }
    if (
      (directionScope === 'both' &&
        (!availableDirections.has('forward') || !availableDirections.has('reverse'))) ||
      (directionScope !== 'both' && !availableDirections.has(directionScope))
    ) {
      setError('This bus does not cover every requested route direction.');
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError('Effective-to date must be on or after effective-from date.');
      return;
    }

    setSaving(true);
    try {
      const reverseStops = resolveReverseStops({
        customizeReturn,
        forwardPickupStopId,
        forwardDropoffStopId,
        reversePickupStopId,
        reverseDropoffStopId,
      });
      await onSubmit({
        studentId,
        busId,
        routeId,
        directionScope,
        forwardPickupStopId: forwardPickupStopId || null,
        forwardDropoffStopId: forwardDropoffStopId || null,
        reversePickupStopId: reverseStops.pickupStopId || null,
        reverseDropoffStopId: reverseStops.dropoffStopId || null,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        existingAssignmentIds: assignments.map((assignment) => assignment.id),
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save this student bus service.',
      );
    } finally {
      setSaving(false);
    }
  }

  const field = 'mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3';
  const stopSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    stopOptions = availableStops,
  ) => (
    <label className="text-sm font-semibold text-gray-700">
      {label}
      <select className={field} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not assigned</option>
        {stopOptions.map((stop) => (
          <option key={stop.id} value={stop.id}>
            {stop.stop_order}. {stop.stop_name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
      {fixedStudentId ? (
        <div className="rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Student</p>
          <p className="mt-1 font-semibold text-navy-900">{studentLabel}</p>
        </div>
      ) : (
        <label className="text-sm font-semibold text-gray-700">
          Student
          <StudentSearchPicker
            value={studentId}
            initialLabel={studentLabel}
            onChange={setStudentId}
          />
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-700">
          Bus route
          <select
            className={field}
            value={routeId}
            disabled={assignments.length > 0}
            onChange={(event) => {
              setRouteId(event.target.value);
              clearStops();
            }}
          >
            <option value="">Choose route</option>
            {routeOptions.map((service) => (
              <option key={service.route_id} value={service.route_id}>
                Bus {service.bus_number} - {service.route_code} {service.route_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700">
          Service directions
          <select
            className={field}
            value={directionScope}
            onChange={(event) => setDirectionScope(event.target.value as DirectionScope)}
          >
            <option value="both">Both directions</option>
            <option value="forward">Outbound only</option>
            <option value="reverse">Return only</option>
          </select>
        </label>
      </div>

      {(directionScope === 'both' || directionScope === 'forward') && (
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold text-navy-900">Outbound stops</legend>
          {stopSelect('Pickup stop', forwardPickupStopId, setForwardPickupStopId)}
          {stopSelect('Drop-off stop', forwardDropoffStopId, setForwardDropoffStopId)}
        </fieldset>
      )}

      {(directionScope === 'both' || directionScope === 'reverse') && (
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-bold text-navy-900">Return stops</legend>
          {directionScope === 'both' && (
            <label className="col-span-full flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={customizeReturn}
                onChange={(event) => setCustomizeReturn(event.target.checked)}
              />
              Customize return stops instead of mirroring outbound
            </label>
          )}
          {customizeReturn || directionScope === 'reverse' ? (
            <>
              {stopSelect(
                'Pickup stop',
                reversePickupStopId,
                setReversePickupStopId,
                [...availableStops].reverse(),
              )}
              {stopSelect(
                'Drop-off stop',
                reverseDropoffStopId,
                setReverseDropoffStopId,
                [...availableStops].reverse(),
              )}
            </>
          ) : (
            <p className="col-span-full text-sm text-gray-600">
              Return pickup uses the outbound drop-off, and return drop-off uses the outbound
              pickup.
            </p>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-700">
          Effective from
          <input
            className={field}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className="text-sm font-semibold text-gray-700">
          Effective to
          <input
            className={field}
            type="date"
            min={effectiveFrom}
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {assignments.length > 0 ? 'Update assignment' : 'Assign student'}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
