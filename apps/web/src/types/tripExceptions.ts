/** Existing database-approved exception identifiers and driver-facing labels. */
export const TRIP_EXCEPTION_TYPES = [
  { value: 'traffic_delay', label: 'Traffic delay' },
  { value: 'weather_delay', label: 'Weather delay' },
  { value: 'mechanical_issue', label: 'Mechanical issue' },
  { value: 'road_closure', label: 'Road closure' },
  { value: 'missed_stop', label: 'Missed stop' },
  { value: 'late_arrival', label: 'Late arrival' },
  { value: 'early_arrival', label: 'Early arrival' },
  { value: 'student_issue', label: 'Student boarding issue' },
  { value: 'other_operational', label: 'Other operational note' },
] as const;

export type TripExceptionType = (typeof TRIP_EXCEPTION_TYPES)[number]['value'];
