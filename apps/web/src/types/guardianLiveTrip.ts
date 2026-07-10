// Guardian live trip visibility UI model for Milestone 6B.
// Keep this narrower than the RPC row shape so the browser app only passes
// around fields needed for safe text-only status UI.

export interface GuardianLiveTrip {
  /** Linked student id. Used only as a React key/map key; never visibly rendered. */
  studentId: string;
  /** Student display name constructed server-side from first + last name. */
  studentName: string;
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
  /** Timestamp the latest location was recorded, or null. */
  lastLocationRecordedAt: string | null;
}
