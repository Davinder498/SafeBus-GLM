// Driver trip location update types for Milestone 4B.
// Field names mirror the public.driver_trip_current_locations table columns.

export type LocationSource = 'browser' | 'manual';

/** Latest/current location row for a trip (mirrors driver_trip_current_locations). */
export interface DriverTripCurrentLocation {
  driver_trip_id: string;
  tenant_id: string;
  driver_id: string;
  bus_id: string;
  route_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  source: LocationSource;
  recorded_at: string;
  updated_at: string;
}

/** Minimal typed result returned by the update_driver_trip_location RPC. */
export interface UpdateLocationResult {
  driver_trip_id: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
}

/** Input the client provides when updating a trip location. tenant_id,
 * driver_id, bus_id, and route_id are derived server-side from the active
 * trip row inside the RPC — never trusted from the client. */
export interface UpdateLocationInput {
  driverTripId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  source?: LocationSource;
}
