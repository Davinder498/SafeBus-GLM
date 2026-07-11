// Guardian pickup/drop-off status UI model for Milestone 8B.
// Keep this narrower than the RPC row shape so the browser app only passes
// around safe text-only status fields.

export type GuardianStudentTripStatus =
  | 'no_active_trip'
  | 'not_picked_up'
  | 'picked_up'
  | 'dropped_off';

export interface GuardianTripEventStatus {
  /** Linked student id. Used only as a React key; never visibly rendered. */
  studentId: string;
  /** Student display name returned by the guardian-scoped RPC. */
  studentDisplayName: string;
  /** Assigned route name, if available. */
  routeName: string | null;
  /** Pickup stop name, if available. */
  pickupStopName: string | null;
  /** Drop-off stop name, if available. */
  dropoffStopName: string | null;
  /** Derived student pickup/drop-off status from the secure RPC. */
  studentTripStatus: GuardianStudentTripStatus;
  /** Latest pickup event time for the active trip, if recorded. */
  pickupEventTime: string | null;
  /** Latest drop-off event time for the active trip, if recorded. */
  dropoffEventTime: string | null;
  /** Latest safe pickup/drop-off event time, if any. */
  lastEventTime: string | null;
}
