import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  setTripOperationalStatus,
  type AdminTripOperationalStatus,
  type TripOperationalReason,
  type TripOperationalStatusValue,
} from '@/services/phase6OperationsService';

const reasons: Array<[TripOperationalReason, string]> = [
  ['traffic', 'Traffic'],
  ['weather', 'Weather'],
  ['mechanical', 'Mechanical'],
  ['driver_unavailable', 'Driver unavailable'],
  ['bus_unavailable', 'Bus unavailable'],
  ['dispatch_unknown', 'Dispatch investigating'],
  ['other_operational', 'Other operational cause'],
];

export function TripDispatchStatus({
  trip,
  onUpdated,
}: {
  trip: AdminTripOperationalStatus;
  onUpdated(): Promise<void>;
}) {
  const [status, setStatus] = useState<TripOperationalStatusValue>(trip.operational_status);
  const [reason, setReason] = useState<TripOperationalReason>(
    trip.reason_code ?? 'dispatch_unknown',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setTripOperationalStatus({ tripId: trip.trip_id, status, reason });
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update dispatch status.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <Select
          aria-label="Operational status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TripOperationalStatusValue)}
        >
          <option value="normal">Normal</option>
          <option value="late">Late</option>
          <option value="missing">Service unconfirmed</option>
        </Select>
        <Select
          aria-label="Operational reason"
          value={reason}
          disabled={status === 'normal'}
          onChange={(e) => setReason(e.target.value as TripOperationalReason)}
        >
          {reasons.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button loading={saving} onClick={() => void save()}>
          Update
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
