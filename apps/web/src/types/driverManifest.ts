export interface DriverManifestRow {
  /** Internal active trip id. Used only as a React key fallback; never visibly rendered. */
  activeTripId: string;
  /** Internal student id. Used only as a React key; never visibly rendered. */
  studentId: string | null;
  studentDisplayName: string | null;
  routeName: string | null;
  tripStatus: string | null;
  tripDirection: string | null;
  pickupStopName: string | null;
  dropoffStopName: string | null;
  assignmentStatus: string | null;
  pickupEventTime: string | null;
  dropoffEventTime: string | null;
  studentTripStatus: 'not_picked_up' | 'picked_up' | 'dropped_off' | null;
}
