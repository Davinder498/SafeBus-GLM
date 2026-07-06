// Admin live trip monitoring types for Milestone 4C.
//
// These fields are returned by the get_admin_live_trip_monitoring() RPC and
// mapped to camelCase by the service layer. Field names follow the milestone
// spec's suggested shape, adapted to the project's actual table/column names.

export interface AdminLiveTrip {
  tripId: string;
  tenantId: string;
  driverId: string;
  driverName: string | null;
  driverEmail: string | null;
  busId: string;
  busLabel: string | null;
  routeId: string;
  routeName: string | null;
  tripType: string | null;
  status: string;
  startedAt: string;
  latestLatitude: number | null;
  latestLongitude: number | null;
  latestLocationAt: string | null;
}

/** Freshness classification computed client-side from latestLocationAt. */
export type LocationFreshness = 'fresh' | 'stale' | 'none';

/** Freshness threshold in milliseconds. <= 60s = fresh, > 60s = stale. */
export const FRESH_THRESHOLD_MS = 60_000;

export function classifyFreshness(
  latestLocationAt: string | null,
  now: number = Date.now(),
): LocationFreshness {
  if (!latestLocationAt) return 'none';
  const ts = Date.parse(latestLocationAt);
  if (Number.isNaN(ts)) return 'none';
  const ageMs = now - ts;
  return ageMs <= FRESH_THRESHOLD_MS ? 'fresh' : 'stale';
}
