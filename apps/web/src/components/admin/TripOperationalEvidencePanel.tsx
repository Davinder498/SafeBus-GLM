import { useCallback, useEffect, useState } from 'react';
import { OperationalNotesPanel } from '@/components/admin/OperationalNotesPanel';
import { Card } from '@/components/ui/Card';
import {
  getPreTripConfirmation,
  getTripExceptions,
  type PreTripConfirmation,
  type TripException,
} from '@/services/phase6OperationsService';

export function TripOperationalEvidencePanel({ tripId }: { tripId: string }) {
  const [confirmation, setConfirmation] = useState<PreTripConfirmation | null>(null);
  const [exceptions, setExceptions] = useState<TripException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConfirmation, nextExceptions] = await Promise.all([
        getPreTripConfirmation(tripId),
        getTripExceptions(tripId),
      ]);
      setConfirmation(nextConfirmation);
      setExceptions(nextExceptions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load trip evidence.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid={`trip-evidence-${tripId}`}>
      <Card className="p-5">
        <h2 className="text-lg font-bold text-navy-900">Trip evidence</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Loading trip evidence...</p>
        ) : error ? (
          <p className="mt-3 text-sm font-semibold text-danger-700" role="alert">
            {error}
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-700">
              Pre-trip:{' '}
              {confirmation
                ? `Confirmed ${new Date(confirmation.confirmed_at).toLocaleString()}`
                : 'Not recorded'}
            </p>
            <h3 className="mt-5 font-bold text-navy-900">Exceptions</h3>
            {exceptions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No exceptions recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {exceptions.map((exception) => (
                  <li key={exception.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-semibold capitalize text-navy-900">
                      {exception.exception_type.replaceAll('_', ' ')}
                    </p>
                    {exception.exception_detail && (
                      <p className="mt-1 text-gray-700">{exception.exception_detail}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(exception.occurred_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      <OperationalNotesPanel targetEntity="trip" targetId={tripId} />
    </div>
  );
}
