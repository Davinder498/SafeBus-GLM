import { useId, useState } from 'react';
import { TripOperationalEvidencePanel } from '@/components/admin/TripOperationalEvidencePanel';
import { StatusPill } from '@/components/ui/StatusPill';
import { directionLabel } from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import { formatAdminTripDate, formatAdminTripTime } from '@/utils/adminTripDates';

export function AdminTripTable({
  trips,
  timeZone,
}: {
  trips: AdminTripOverviewItem[];
  timeZone?: string;
}) {
  const [notesTripId, setNotesTripId] = useState<string | null>(null);
  const notesPanelId = useId();
  const visibleNotesTripId = trips.some((trip) => trip.id === notesTripId) ? notesTripId : null;

  return (
    <div className="mt-4" data-testid="admin-trips-table">
      <div
        className="overflow-x-auto rounded-lg border border-gray-200"
        tabIndex={0}
        role="region"
        aria-label="Trip results"
      >
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <caption className="sr-only">Recorded trips matching the selected filters</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              {[
                'Route and direction',
                'Bus',
                'Driver',
                'Service date',
                'Start',
                'End',
                'Status',
                'Notes',
              ].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trips.map((trip) => (
              <tr key={trip.id}>
                <td className="px-3 py-3">
                  <span className="font-semibold text-navy-900">{trip.routeName}</span>
                  <span className="block text-gray-600">
                    {trip.routeCode} · {directionLabel(trip.direction)} · {trip.tripPatternName}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-700">{trip.busLabel}</td>
                <td className="px-3 py-3 text-gray-700">{trip.driverLabel}</td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                  {formatAdminTripDate(trip.serviceDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                  {formatAdminTripTime(trip.startedAt, timeZone)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                  {trip.endedAt
                    ? formatAdminTripTime(trip.endedAt, timeZone)
                    : trip.status === 'active' || trip.status === 'paused'
                      ? 'In progress'
                      : 'Not recorded'}
                </td>
                <td className="px-3 py-3">
                  <StatusPill tone={trip.status === 'active' ? 'success' : 'neutral'}>
                    {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                  </StatusPill>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                    aria-expanded={visibleNotesTripId === trip.id}
                    aria-label={`${visibleNotesTripId === trip.id ? 'Hide notes' : 'View notes'} for ${trip.routeName}, ${formatAdminTripDate(trip.serviceDate)}`}
                    aria-controls={visibleNotesTripId === trip.id ? notesPanelId : undefined}
                    onClick={() =>
                      setNotesTripId((current) => (current === trip.id ? null : trip.id))
                    }
                  >
                    {visibleNotesTripId === trip.id ? 'Hide notes' : 'View notes'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleNotesTripId && (
        <div className="mt-4" id={notesPanelId}>
          <TripOperationalEvidencePanel
            key={visibleNotesTripId}
            tripId={visibleNotesTripId}
            timeZone={timeZone}
          />
        </div>
      )}
    </div>
  );
}
