// Admin live fleet monitoring types.
//
// These fields are returned by the get_admin_live_fleet_monitoring() RPC and
// mapped to camelCase by the service layer. They intentionally exclude tenant
// IDs, raw trip/bus/route/driver IDs, guardian data, student data, and driver
// contact data.

export type LocationFreshness = 'live' | 'stale' | 'missing';

export type FleetIssueLabel = 'OK' | 'Stale GPS' | 'Missing GPS' | 'Speed unavailable' | 'Needs attention';

export interface AdminLiveTrip {
  busLabel: string | null;
  routeName: string | null;
  driverName: string | null;
  tripType: string | null;
  status: string;
  startedAt: string;
  latestLatitude: number | null;
  latestLongitude: number | null;
  latestLocationAt: string | null;
  speedMps: number | null;
  locationStatus: LocationFreshness;
  issueLabel: FleetIssueLabel;
  nextStopName: string | null;
  etaStatus: string | null;
  etaLabel: string | null;
  etaUpdatedAt: string | null;
}

export const UI_STALE_LOCATION_THRESHOLD_LABEL = '2 minutes';

export function hasValidCoordinates(trip: Pick<AdminLiveTrip, 'latestLatitude' | 'latestLongitude'>): boolean {
  return (
    typeof trip.latestLatitude === 'number'
    && Number.isFinite(trip.latestLatitude)
    && trip.latestLatitude >= -90
    && trip.latestLatitude <= 90
    && typeof trip.latestLongitude === 'number'
    && Number.isFinite(trip.latestLongitude)
    && trip.latestLongitude >= -180
    && trip.latestLongitude <= 180
  );
}
