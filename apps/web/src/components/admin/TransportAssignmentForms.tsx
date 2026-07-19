import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { CreateAssignmentInput } from '@/types/driverAssignments';
import type {
  Bus,
  CreateBusRouteAssignmentInput,
  Driver,
  Route,
  RouteTripPattern,
} from '@/types/transportation';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';

const fieldClassName =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const labelClassName = 'text-sm font-semibold text-gray-700';

export function RouteBusAssignmentForm({
  route,
  buses,
  tripPatterns,
  onSubmit,
  onCancel,
}: {
  route: Route;
  buses: Bus[];
  tripPatterns: RouteTripPattern[];
  onSubmit: (input: CreateBusRouteAssignmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const patterns = useMemo(
    () =>
      tripPatterns.filter(
        (pattern) =>
          pattern.route_id === route.id &&
          pattern.status === 'active' &&
          !pattern.schedule_review_required,
      ),
    [route.id, tripPatterns],
  );
  const [tripPatternId, setTripPatternId] = useState(patterns[0]?.id ?? '');
  const [busId, setBusId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const pattern = patterns.find((item) => item.id === tripPatternId);
    if (!pattern || !busId || !effectiveFrom) {
      setError('Select a named trip, bus, and effective-from date.');
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError('Effective-to date must be on or after effective-from date.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        tenant_id: route.tenant_id,
        bus_id: busId,
        route_id: route.id,
        route_trip_pattern_id: pattern.id,
        trip_type: pattern.direction === 'reverse' ? 'evening' : 'morning',
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        status: 'active',
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to assign this bus.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <p className="text-sm text-gray-600">
        Assign one bus to a named trip. Forward and reverse trips can use the same or different
        buses.
      </p>
      {route.definition_status !== 'ready' || route.status !== 'active' ? (
        <p className="rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-700">
          Activate a map-ready route before assigning a bus.
        </p>
      ) : null}
      {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Named trip
          <select
            className={fieldClassName}
            value={tripPatternId}
            onChange={(event) => setTripPatternId(event.target.value)}
          >
            <option value="">Select a trip</option>
            {patterns.map((pattern) => (
              <option key={pattern.id} value={pattern.id}>
                {pattern.display_name} (
                {pattern.direction === 'forward' ? 'Start → End' : 'End → Start'})
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Bus
          <select
            className={fieldClassName}
            value={busId}
            onChange={(event) => setBusId(event.target.value)}
          >
            <option value="">Select a bus</option>
            {buses
              .filter((bus) => bus.status === 'active')
              .map((bus) => (
                <option key={bus.id} value={bus.id}>
                  Bus {bus.bus_number}
                </option>
              ))}
          </select>
        </label>
        <label className={labelClassName}>
          Effective from
          <input
            className={fieldClassName}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className={labelClassName}>
          Effective to
          <input
            className={fieldClassName}
            type="date"
            min={effectiveFrom}
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="submit"
          disabled={saving || route.definition_status !== 'ready' || route.status !== 'active'}
        >
          {saving ? 'Assigning' : 'Assign bus'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BusDriverAssignmentForm({
  bus,
  services,
  drivers,
  profileLabels,
  onSubmit,
  onCancel,
}: {
  bus: Bus;
  services: BusServiceOption[];
  drivers: Driver[];
  profileLabels: Map<string, string>;
  onSubmit: (input: CreateAssignmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [driverId, setDriverId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const service = services.find((item) => item.id === serviceId);
    if (!service || !service.route_trip_pattern_id || !driverId || !effectiveFrom) {
      setError('Select a bus trip, driver, and effective-from date.');
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError('Effective-to date must be on or after effective-from date.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        driverId,
        busId: bus.id,
        routeId: service.route_id,
        tripPatternId: service.route_trip_pattern_id,
        tripType: service.trip_type,
        status: 'active',
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Unable to assign this driver.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <p className="text-sm text-gray-600">
        Assign a driver to one of Bus {bus.bus_number}&apos;s active route trips.
      </p>
      {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Bus route trip
          <select
            className={fieldClassName}
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          >
            <option value="">Select a bus trip</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.route_code} · {service.trip_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Driver
          <select
            className={fieldClassName}
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">Select a driver</option>
            {drivers
              .filter((driver) => driver.status === 'active')
              .map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {profileLabels.get(driver.profile_id) ?? driver.employee_number ?? 'Driver'}
                </option>
              ))}
          </select>
        </label>
        <label className={labelClassName}>
          Effective from
          <input
            className={fieldClassName}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className={labelClassName}>
          Effective to
          <input
            className={fieldClassName}
            type="date"
            min={effectiveFrom}
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={saving || services.length === 0}>
          {saving ? 'Assigning' : 'Assign driver'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
