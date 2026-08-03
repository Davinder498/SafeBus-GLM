import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { OrganizationProfile } from '@/types/organization';
import type {
  Bus,
  CreateBusRouteAssignmentInput,
  Driver,
  Route,
  RouteTripPattern,
} from '@/types/transportation';
import type { AdminBusRouteAssignment } from '@/services/adminBusWorkspaceService';
import type { ReplaceBusTripDriverInput } from '@/services/adminBusWorkspaceService';

const fieldClassName =
  'mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900';
const labelClassName = 'block text-sm font-semibold text-gray-700';

export function BusWorkspaceRouteForm({
  bus,
  assignment,
  identityLocked = false,
  routes,
  tripPatterns,
  assignments,
  onSubmit,
  onCancel,
}: {
  bus: Bus;
  assignment?: AdminBusRouteAssignment | null;
  identityLocked?: boolean;
  routes: Route[];
  tripPatterns: RouteTripPattern[];
  assignments: AdminBusRouteAssignment[];
  onSubmit: (input: CreateBusRouteAssignmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const eligibleRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          (route.status === 'active' && route.definition_status === 'ready') ||
          route.id === assignment?.route_id,
      ),
    [assignment?.route_id, routes],
  );
  const [routeId, setRouteId] = useState(assignment?.route_id ?? eligibleRoutes[0]?.id ?? '');
  const patterns = useMemo(
    () =>
      tripPatterns.filter(
        (pattern) =>
          pattern.route_id === routeId &&
          ((pattern.status === 'active' && !pattern.schedule_review_required) ||
            pattern.id === assignment?.route_trip_pattern_id),
      ),
    [assignment?.route_trip_pattern_id, routeId, tripPatterns],
  );
  const [tripPatternId, setTripPatternId] = useState(assignment?.route_trip_pattern_id ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(
    assignment?.effective_from ?? new Date().toISOString().slice(0, 10),
  );
  const [effectiveTo, setEffectiveTo] = useState(assignment?.effective_to ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const pattern = patterns.find((item) => item.id === tripPatternId);
    if (!pattern || !routeId || !effectiveFrom) {
      setError('Select a route, named trip, and effective-from date.');
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError('Effective-to date must be on or after effective-from date.');
      return;
    }
    const duplicate = assignments.some(
      (item) =>
        item.id !== assignment?.id &&
        item.status === 'active' &&
        item.route_trip_pattern_id === pattern.id &&
        (!item.effective_to || item.effective_to >= effectiveFrom) &&
        (!effectiveTo || !item.effective_from || item.effective_from <= effectiveTo),
    );
    if (duplicate) {
      setError('This bus already has an overlapping assignment for that named trip.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        tenant_id: bus.tenant_id,
        bus_id: bus.id,
        route_id: routeId,
        route_trip_pattern_id: pattern.id,
        trip_type: pattern.direction === 'reverse' ? 'evening' : 'morning',
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        status: 'active',
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Unable to assign this route trip.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <p className="text-sm text-gray-600">
        {assignment ? 'Update' : 'Assign'} Bus {bus.bus_number}{' '}
        {assignment ? 'route-trip dates and configuration.' : 'to one reviewed named trip.'}{' '}
        Outbound and return trips are assigned separately.
      </p>
      {identityLocked && (
        <p className="rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-700">
          This route trip has linked people or history. You can update its dates, but preserving
          that history requires a new assignment when the route or named trip changes.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Route
          <select
            className={fieldClassName}
            value={routeId}
            disabled={identityLocked}
            onChange={(event) => {
              setRouteId(event.target.value);
              setTripPatternId('');
            }}
          >
            <option value="">Select a route</option>
            {eligibleRoutes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.route_code} - {route.route_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Named trip
          <select
            className={fieldClassName}
            value={tripPatternId}
            disabled={identityLocked}
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
      {eligibleRoutes.length === 0 && (
        <p className="rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-700">
          No active, map-ready routes with reviewed trips are available.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} disabled={eligibleRoutes.length === 0}>
          {assignment ? 'Save route assignment' : 'Assign route trip'}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BusWorkspaceDriverForm({
  service,
  drivers,
  profiles,
  initialDriverId,
  canInviteDriver,
  onAddDriver,
  onSubmit,
  onCancel,
}: {
  service: AdminBusRouteAssignment;
  drivers: Driver[];
  profiles: OrganizationProfile[];
  initialDriverId?: string;
  canInviteDriver: boolean;
  onAddDriver: () => void;
  onSubmit: (input: ReplaceBusTripDriverInput) => Promise<void>;
  onCancel: () => void;
}) {
  const profileNames = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.full_name])),
    [profiles],
  );
  const [driverId, setDriverId] = useState(initialDriverId ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!driverId || !effectiveFrom) {
      setError('Select a driver and effective-from date.');
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
        busRouteAssignmentId: service.id,
        driverId,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save this driver.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="rounded-lg bg-gray-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Route trip</p>
        <p className="mt-1 font-semibold text-navy-900">
          {service.route_code} · {service.trip_name}
        </p>
      </div>
      {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
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
                  {profileNames.get(driver.profile_id) ?? driver.employee_number ?? 'Driver'}
                </option>
              ))}
          </select>
        </label>
        <div className="flex items-end">
          {canInviteDriver && (
            <Button type="button" variant="outline" onClick={onAddDriver}>
              Add driver
            </Button>
          )}
        </div>
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
      <p className="text-sm text-gray-600">
        Saving deactivates any overlapping driver assignment for this named trip and keeps it in
        history.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Save driver assignment
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
