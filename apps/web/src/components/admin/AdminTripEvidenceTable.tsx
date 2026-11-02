import { Link, useLocation } from 'react-router';
import type { AdminTripEvidence } from '@/types/adminTripReport';
import { TRIP_EXCEPTION_TYPES } from '@/types/tripExceptions';
import { formatAdminTripDate, formatAdminTripTimestamp } from '@/utils/adminTripDates';
import { directionLabel } from '@/services/adminTripOverviewService';

export function AdminTripEvidenceTable({
  rows,
  dispatch,
}: {
  rows: AdminTripEvidence[];
  dispatch: boolean;
}) {
  const location = useLocation();
  return (
    <div
      className="mt-4 overflow-x-auto rounded-lg border border-gray-200"
      tabIndex={0}
      role="region"
      aria-label={dispatch ? 'Dispatch flags' : 'Driver exceptions'}
    >
      <table
        className="min-w-full divide-y divide-gray-200 text-left text-sm"
        data-testid="trip-evidence-table"
      >
        <caption className="sr-only">{dispatch ? 'Dispatch flags' : 'Driver exceptions'}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-gray-600">
          <tr>
            {[
              'Service date',
              'Route and direction',
              'Bus',
              'Recorded driver',
              'Trip status',
              dispatch ? 'Recorded flag' : 'Exception',
              'Recorded at',
              ...(dispatch ? ['Reason'] : []),
              'Details',
            ].map((h) => (
              <th key={h} scope="col" className="px-3 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-3 py-3">
                {formatAdminTripDate(row.trip.serviceDate)}
              </td>
              <td className="px-3 py-3">
                <span className="font-semibold text-navy-900">{row.trip.routeName}</span>
                <span className="block text-gray-600">
                  {row.trip.routeCode} · {directionLabel(row.trip.direction)} ·{' '}
                  {row.trip.tripPatternName}
                </span>
              </td>
              <td className="px-3 py-3">{row.trip.busLabel}</td>
              <td className="px-3 py-3">{row.trip.driverLabel}</td>
              <td className="px-3 py-3 capitalize">{row.trip.status}</td>
              <td className="px-3 py-3">
                {dispatch
                  ? `Dispatcher marked ${row.category}`
                  : (TRIP_EXCEPTION_TYPES.find((t) => t.value === row.category)?.label ??
                    row.category.replaceAll('_', ' '))}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {formatAdminTripTimestamp(row.recordedAt)}
              </td>
              {dispatch && (
                <td className="px-3 py-3">{row.reason?.replaceAll('_', ' ') ?? 'Not recorded'}</td>
              )}
              <td className="px-3 py-3">
                <Link
                  to={`/admin/trips/${row.trip.id}`}
                  state={{ tripReturnTo: location.pathname + location.search }}
                  className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 py-2 font-semibold text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                  aria-label={`View trip for ${row.trip.routeName}, ${formatAdminTripDate(row.trip.serviceDate)}`}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
