import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { AdminTripTable } from '@/components/admin/AdminTripTable';
import { DataState } from '@/components/ui/DataState';
import type { AdminTripFilter, AdminTripOverviewItem } from '@/types/adminTripOverview';
import { filterAdminTrips, isNonActiveTrip } from '@/utils/adminTripOverview';

const filters: Array<{ value: AdminTripFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
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
    paused: trips.filter((trip) => trip.status === 'paused').length,
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
            className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5"
            aria-label="Trip status summary"
          >
            {[
              ['Active', counts.active],
              ['Paused', counts.paused],
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
            <AdminTripTable trips={filteredTrips} />
          )}
        </>
      )}
    </section>
  );
}
