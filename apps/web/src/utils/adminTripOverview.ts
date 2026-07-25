import type {
  AdminTripFilter,
  AdminTripOverviewItem,
  AdminTripStatus,
} from '@/types/adminTripOverview';

export function isNonActiveTrip(status: AdminTripStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function filterAdminTrips(
  trips: AdminTripOverviewItem[],
  filter: AdminTripFilter,
): AdminTripOverviewItem[] {
  if (filter === 'all') return trips;
  if (filter === 'non-active') return trips.filter((trip) => isNonActiveTrip(trip.status));
  return trips.filter((trip) => trip.status === filter);
}
