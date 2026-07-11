// Guardian live bus location state contract for Milestone 11A.
//
// Values are returned by get_guardian_student_live_bus_location_state().
// Stale, missing, and invalid states intentionally withhold displayable
// coordinates so future map UI cannot show unsafe old or malformed locations.

export type GuardianLiveBusLocationState = 'fresh' | 'stale' | 'missing' | 'invalid';

export interface GuardianStudentLiveBusLocation {
  studentId: string;
  locationState: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  locationAgeSeconds: number | null;
}
