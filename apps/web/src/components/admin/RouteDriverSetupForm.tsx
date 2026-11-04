import { AdminReferencePicker } from './AdminReferencePicker';
import { albertaToday } from '@/utils/adminTripDates';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import {
  setPlannedDriverAssignment,
  updateAssignmentStatus,
} from '@/services/driverAssignmentService';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { Driver } from '@/types/transportation';

export function RouteDriverSetupForm({
  service,
  drivers,
  names,
  assignments,
  initialDriverId,
  onSaved,
}: {
  service: BusServiceOption;
  drivers: Driver[];
  names: Map<string, string>;
  assignments: DriverRouteAssignment[];
  /** Verified newly invited driver, never auto-saved. */
  initialDriverId?: string;
  onSaved(): void;
}) {
  const activePlans = assignments.filter(
    (assignment) => assignment.bus_route_assignment_id === service.id && assignment.status === 'active',
  );
  // For the common single-plan case, editing starts with the saved assignment
  // instead of requiring administrators to reselect it in a second dropdown.
  const initialPlan = activePlans.length === 1 ? activePlans[0] : null;
  const [existingId, setExistingId] = useState(initialPlan?.id ?? '');
  const [removing, setRemoving] = useState(false);
  const [driverId, setDriverId] = useState(initialDriverId ?? initialPlan?.driver_id ?? '');
  const [from, setFrom] = useState(initialPlan?.effective_from ?? service.effective_from ?? albertaToday());
  const [to, setTo] = useState(initialPlan?.effective_to ?? service.effective_to ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const plans = assignments.filter(
    (a) => a.bus_route_assignment_id === service.id && a.status === 'active',
  );
  function selectPlan(id: string) {
    const plan = plans.find((a) => a.id === id);
    setExistingId(id);
    setDriverId(plan?.driver_id ?? '');
    setFrom(plan?.effective_from ?? service.effective_from ?? albertaToday());
    setTo(plan?.effective_to ?? service.effective_to ?? '');
    setMessage(null);
    setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!driverId || !from || (to && to < from)) {
      setError('Choose a driver and a valid service date range.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await setPlannedDriverAssignment({
        driverId,
        busRouteAssignmentId: service.id,
        effectiveFrom: from,
        effectiveTo: to || null,
        existingAssignmentId: existingId || null,
      });
      setExistingId(saved.id);
      setMessage('Driver and service dates saved.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save driver.');
    } finally {
      setBusy(false);
    }
  }
  const field = 'mt-2 w-full rounded-lg border border-navy-200 px-3 py-2';
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-navy-200 p-4"
      aria-label={`Driver for ${service.trip_name} bus ${service.bus_number}`}
    >
      <h3 className="font-bold text-navy-900">
        {service.trip_name} · Bus {service.bus_number}
      </h3>
      <p className="text-sm text-gray-600">
        Bus service: {service.effective_from ?? 'No start limit'} to{' '}
        {service.effective_to ?? 'No end date'}. Driver dates must fit this service.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success-700">
          {message}
        </p>
      )}
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Driver plan
          <select className={field} value={existingId} onChange={(e) => selectPlan(e.target.value)}>
            <option value="">Add a driver plan</option>
            {plans.map((a) => (
              <option key={a.id} value={a.id}>
                Edit{' '}
                {names.get(drivers.find((d) => d.id === a.driver_id)?.profile_id ?? '') ?? 'Driver'}{' '}
                · {a.effective_from ?? 'No start limit'} – {a.effective_to ?? 'No end date'}
              </option>
            ))}
          </select>
        </label>
        <AdminReferencePicker entity="drivers" value={driverId}
          selectedLabel={names.get(drivers.find((driver) => driver.id === driverId)?.profile_id ?? '')}
          onChange={setDriverId} />
        <label className="text-sm font-semibold">
          Service starts
          <input
            className={field}
            type="date"
            value={from}
            min={service.effective_from ?? undefined}
            max={service.effective_to ?? undefined}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Service ends (optional)
          <input
            className={field}
            type="date"
            value={to}
            min={from}
            max={service.effective_to ?? undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving driver' : 'Save driver and dates'}
      </Button>
      {existingId && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setRemoving(true)}>
          Remove driver plan
        </Button>
      )}
      <ConfirmDialog
        open={removing}
        title="Remove driver plan"
        description="Remove this driver from the selected bus service plan while preserving its history."
        confirmLabel="Remove driver plan"
        destructive
        busy={busy}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          if (busy || !existingId) return;
          setBusy(true);
          setError(null);
          void updateAssignmentStatus(existingId, 'inactive')
            .then(() => {
              selectPlan('');
              setMessage('Driver plan removed.');
              onSaved();
            })
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : 'Unable to remove driver plan.'),
            )
            .finally(() => {
              setBusy(false);
              setRemoving(false);
            });
        }}
      />
    </form>
  );
}
