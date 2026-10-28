import { Link, useLocation } from 'react-router';
import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { directionLabel } from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import { formatAdminTripDate, formatAdminTripTime } from '@/utils/adminTripDates';
import type { AdminTripOperation } from '@/types/adminTripDetail';
import { tripLocationLabel } from '@/utils/adminTripPresentation';

export function AdminTripTable({
  trips,
  timeZone,
  testId = 'admin-trips-table',
  resultsLabel = 'Trip results',
}: {
  trips: (AdminTripOverviewItem | AdminTripOperation)[];
  timeZone?: string;
  testId?: string;
  resultsLabel?: string;
}) {
  const location = useLocation();
  const operational = trips.some((trip) => 'locationStatus' in trip);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!operational) return;
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 5_000);
    window.addEventListener('offline', update);
    window.addEventListener('online', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
    };
  }, [operational]);

  return (
    <div className="mt-4" data-testid={testId}>
      <div
        className="overflow-x-auto rounded-lg border border-gray-200"
        tabIndex={0}
        role="region"
        aria-label={resultsLabel}
      >
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <caption className="sr-only">{resultsLabel}</caption>
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
                ...(operational ? ['Location status', 'ETA / issue'] : []),
                'Details',
              ].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trips.map((source) => {
              let trip = source;
              if ('locationStatus' in source && source.locationStatus === 'live') {
                const recorded = Date.parse(source.latestLocationAt ?? '');
                const status =
                  !navigator.onLine || !Number.isFinite(recorded) || recorded - now > 30_000
                    ? 'invalid'
                    : now - recorded > 120_000
                      ? 'stale'
                      : 'live';
                if (status !== 'live')
                  trip = { ...source, locationStatus: status, etaLabel: null, nextStopName: null };
              }
              return (
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
                  {operational && (
                    <td className="px-3 py-3">
                      {'locationStatus' in trip ? tripLocationLabel(trip.locationStatus) : '—'}
                    </td>
                  )}
                  {operational && (
                    <td className="px-3 py-3 text-gray-700">
                      {'locationStatus' in trip && trip.status === 'active'
                        ? trip.locationStatus === 'live'
                          ? (trip.etaLabel ?? 'ETA unavailable')
                          : tripLocationLabel(trip.locationStatus)
                        : '—'}
                      {'nextStopName' in trip &&
                        trip.nextStopName &&
                        trip.locationStatus === 'live' && (
                          <span className="block text-xs">Next: {trip.nextStopName}</span>
                        )}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <Link
                      to={`/admin/trips/${trip.id}`}
                      state={{ tripReturnTo: location.pathname + location.search }}
                      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 font-semibold text-navy-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                      aria-label={`View trip for ${trip.routeName}, ${formatAdminTripDate(trip.serviceDate)}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
