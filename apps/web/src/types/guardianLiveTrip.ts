// Guardian live trip visibility types for Milestone 6A.
// Field names mirror the get_guardian_live_trip_visibility() RPC columns.
//
// This is the SECURITY FOUNDATION shape only. It intentionally excludes bus id,
// driver id/name/phone, trip uuid, speed, and any historical location trail.

export interface GuardianLiveTrip {
  /** Linked student id (safe to show: guardian already sees this via 0015). */
  studentId: string;
  /** Student display name constructed server-side from first + last name. */
  studentName: string;
  /** Assigned route id. */
  routeId: string;
  /** Assigned route name. */
  routeName: string;
  /** Pickup stop name, if assigned. */
  pickupStopName: string | null;
  /** Drop-off stop name, if assigned. */
  dropoffStopName: string | null;
  /** Trip status of the latest active trip on the route, or null if none. */
  tripStatus: string | null;
  /** True only when there is an active (in-progress) trip on the route now. */
  hasActiveTrip: boolean;
  /** Latest reported bus latitude for the active trip, or null. */
  lastLocationLatitude: number | null;
  /** Latest reported bus longitude for the active trip, or null. */
  lastLocationLongitude: number | null;
  /** Timestamp the latest location was recorded, or null. */
  lastLocationRecordedAt: string | null;
}