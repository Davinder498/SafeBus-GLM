import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { StatusPill } from '@/components/ui/StatusPill';
import { directionLabel } from '@/services/adminTripOverviewService';
import type { AdminTripFilter, AdminTripOverviewItem } from '@/types/adminTripOverview';
import { filterAdminTrips, isNonActiveTrip } from '@/utils/adminTripOverview';

const filters: Array<{ value: AdminTripFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'non-active', label: 'Non-active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdminTripsOverview({
  trips,
  failed = false,
  showAllLink = true,
  showLiveLink = true,
  title = 'Trips',
  description = 'Dated operational runs. Routes and their outbound and return patterns remain reusable definitions.',
  initialFilter = 'all',
}: {
  trips: AdminTripOverviewItem[];
  failed?: boolean;
  showAllLink?: boolean;
  showLiveLink?: boolean;
  title?: string;
  description?: string;
  initialFilter?: AdminTripFilter;
}) {
  const [filter, setFilter] = useState<AdminTripFilter>(initialFilter);
  const filteredTrips = useMemo(() => filterAdminTrips(trips, filter), [filter, trips]);
  const counts = {
    active: trips.filter((trip) => trip.status === 'active').length,
    nonActive: trips.filter((trip) => isNonActiveTrip(trip.status)).length,
    completed: trips.filter((trip) => trip.status === 'completed').length,
    cancelled: trips.filter((trip) => trip.status === 'cancelled').length,
  };

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="trip-overview-heading"
      data-testid="admin-trips-overview"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="trip-overview-heading" className="text-xl font-bold text-navy-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex gap-2">
          {showLiveLink && (
            <Link
              className="rounded-lg border border-cyan-200 px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50"
              to="/admin/live-trips"
            >
              Live GPS
            </Link>
          )}
          {showAllLink && (
            <Link
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50"
              to="/admin/trips"
            >
              All trips
            </Link>
          )}
        </div>
      </div>

      {failed ? (
        <div className="mt-4" role="status" data-testid="admin-trips-partial-failure">
          <DataState
            title="Trip summaries unavailable"
            message="Other overview information is still available. Try this section again later."
          />
        </div>
      ) : (
        <>
          <div
            className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
            aria-label="Trip status summary"
          >
            {[
              ['Active', counts.active],
              ['Non-active', counts.nonActive],
              ['Completed', counts.completed],
              ['Cancelled', counts.cancelled],
            ].map(([label, count]) => (
              <Card className="p-4" key={label}>
                <p className="text-sm font-semibold text-gray-600">{label}</p>
                <p className="mt-1 text-2xl font-bold text-navy-900">{count}</p>
              </Card>
            ))}
          </div>

          <div
            className="mt-5 flex flex-wrap gap-2"
            role="group"
            aria-label="Filter trips by status"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${filter === item.value ? 'bg-navy-900 text-white' : 'bg-slate-100 text-gray-700 hover:bg-slate-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {filteredTrips.length === 0 ? (
            <div className="mt-4" data-testid="admin-trips-empty">
              <DataState
                title={`No ${filter === 'all' ? '' : `${filter} `}trips`}
                message="No dated operational runs match this category."
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto" data-testid="admin-trips-table">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <caption className="sr-only">Recent dated trip executions</caption>
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
                    ].map((heading) => (
                      <th key={heading} scope="col" className="px-3 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTrips.map((trip) => (
                    <tr key={trip.id}>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-navy-900">{trip.routeName}</span>
                        <span className="block text-gray-600">
                          {trip.routeCode} · {directionLabel(trip.direction)} ·{' '}
                          {trip.tripPatternName}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{trip.busLabel}</td>
                      <td className="px-3 py-3 text-gray-700">{trip.driverLabel}</td>
                      <td className="px-3 py-3 text-gray-700">{formatDate(trip.serviceDate)}</td>
                      <td className="px-3 py-3 text-gray-700">{formatTime(trip.startedAt)}</td>
                      <td className="px-3 py-3 text-gray-700">
                        {trip.endedAt ? formatTime(trip.endedAt) : 'In progress'}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill tone={trip.status === 'active' ? 'success' : 'neutral'}>
                          {statusLabel(trip.status)}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function statusLabel(status: AdminTripOverviewItem['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
