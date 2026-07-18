import { useMemo, useState, type FormEvent } from 'react';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import { Button } from '@/components/ui/Button';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import type { CreateStudentBusAssignmentInput, RouteStop, StudentBusAssignment, StudentBusAssignmentStatus, UpdateStudentBusAssignmentInput } from '@/types/transportation';

export function StudentBusAssignmentForm({ assignment, studentLabel, fixedStudentId, services, stops, defaultTenantId, onSubmit, onCancel }: {
  assignment: StudentBusAssignment | null;
  studentLabel?: string;
  fixedStudentId?: string;
  services: BusServiceOption[];
  stops: RouteStop[];
  defaultTenantId: string | null;
  onSubmit: (input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [studentId, setStudentId] = useState(assignment?.student_id ?? fixedStudentId ?? '');
  const [serviceId, setServiceId] = useState(assignment?.bus_route_assignment_id ?? '');
  const [pickupStopId, setPickupStopId] = useState(assignment?.pickup_stop_id ?? '');
  const [dropoffStopId, setDropoffStopId] = useState(assignment?.dropoff_stop_id ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(assignment?.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState(assignment?.effective_to ?? '');
  const [status, setStatus] = useState<StudentBusAssignmentStatus>(assignment?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const service = services.find((item) => item.id === serviceId);
  const availableStops = useMemo(
    () =>
      stops
        .filter((stop) => stop.route_id === service?.route_id && stop.status === 'active')
        .sort((a, b) =>
          service?.direction === 'reverse'
            ? b.stop_order - a.stop_order
            : a.stop_order - b.stop_order,
        ),
    [service?.direction, service?.route_id, stops],
  );

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (!studentId || !service || !defaultTenantId) { setError('Choose a student and bus service.'); return; }
    if (pickupStopId && !availableStops.some((stop) => stop.id === pickupStopId)) { setError('Pickup stop must belong to the bus service route.'); return; }
    if (dropoffStopId && !availableStops.some((stop) => stop.id === dropoffStopId)) { setError('Drop-off stop must belong to the bus service route.'); return; }
    if (effectiveTo && effectiveTo < effectiveFrom) { setError('Effective-to date must be on or after effective-from date.'); return; }
    const pickupIndex = availableStops.findIndex((stop) => stop.id === pickupStopId);
    const dropoffIndex = availableStops.findIndex((stop) => stop.id === dropoffStopId);
    if (pickupIndex >= 0 && dropoffIndex >= 0 && pickupIndex > dropoffIndex) {
      setError('Pickup must come before drop-off in the selected trip direction.');
      return;
    }
    const values = { student_id: studentId, bus_route_assignment_id: service.id, route_trip_pattern_id: service.route_trip_pattern_id, pickup_stop_id: pickupStopId || null, dropoff_stop_id: dropoffStopId || null, effective_from: effectiveFrom, effective_to: effectiveTo || null, status };
    setSaving(true);
    try { await onSubmit(assignment ? values : { tenant_id: defaultTenantId, ...values }); }
    finally { setSaving(false); }
  }

  const field = 'mt-2 w-full rounded-lg border border-gray-300 px-4 py-3';
  return <form className="grid gap-4" onSubmit={submit}>
    {error && <p className="text-sm font-semibold text-danger-700">{error}</p>}
    {fixedStudentId ? (
      <div className="rounded-lg bg-gray-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Student</p><p className="mt-1 font-semibold text-navy-900">{studentLabel}</p></div>
    ) : <label className="text-sm font-semibold text-gray-700">Student<StudentSearchPicker value={studentId} initialLabel={studentLabel} onChange={setStudentId} /></label>}
    <label className="text-sm font-semibold text-gray-700">Bus service<select className={field} value={serviceId} onChange={(event) => { setServiceId(event.target.value); setPickupStopId(''); setDropoffStopId(''); }}><option value="">Choose bus and route</option>{services.map((item) => <option key={item.id} value={item.id}>Bus {item.bus_number} - {item.route_code} {item.route_name} ({item.trip_name ?? item.trip_type})</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold text-gray-700">Pickup stop<select className={field} value={pickupStopId} onChange={(event) => setPickupStopId(event.target.value)}><option value="">Not assigned</option>{availableStops.map((stop) => <option key={stop.id} value={stop.id}>{stop.stop_order}. {stop.stop_name}</option>)}</select></label>
      <label className="text-sm font-semibold text-gray-700">Drop-off stop<select className={field} value={dropoffStopId} onChange={(event) => setDropoffStopId(event.target.value)}><option value="">Not assigned</option>{availableStops.map((stop) => <option key={stop.id} value={stop.id}>{stop.stop_order}. {stop.stop_name}</option>)}</select></label>
      <label className="text-sm font-semibold text-gray-700">Effective from<input className={field} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
      <label className="text-sm font-semibold text-gray-700">Effective to<input className={field} type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} /></label>
      <label className="text-sm font-semibold text-gray-700">Status<select className={field} value={status} onChange={(event) => setStatus(event.target.value as StudentBusAssignmentStatus)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
    </div>
    <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save assignment'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
