export type GuardianBusAssignmentState = 'assigned' | 'unassigned' | 'unavailable';
export type GuardianLiveBusLocationState = 'inactive' | 'fresh' | 'stale' | 'missing' | 'invalid';
export type GuardianStudentTripStatus =
  'no_active_trip' | 'not_picked_up' | 'picked_up' | 'dropped_off';

/**
 * Bus-first guardian contract. Route, stop, driver, bus UUID, and trip UUID
 * fields intentionally do not exist in this browser model.
 */
export interface GuardianStudentLiveBusLocation {
  studentId: string;
  studentName: string;
  studentGrade: string | null;
  assignmentState: GuardianBusAssignmentState;
  busNumber: string | null;
  licensePlate: string | null;
  hasActiveTrip: boolean;
  locationState: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  locationAgeSeconds: number | null;
  etaStatus: string | null;
  etaLabel: string | null;
  studentTripStatus: GuardianStudentTripStatus;
  pickupEventTime: string | null;
  dropoffEventTime: string | null;
  lastEventTime: string | null;
}

export type GuardianBusVisibility = GuardianStudentLiveBusLocation;

export type GuardianBusServiceTripStatus = 'active' | 'paused' | 'inactive';

export interface GuardianBusServiceStop {
  name: string;
  order: number;
  latitude: number | null;
  longitude: number | null;
  plannedArrivalTime: string | null;
}

/**
 * Guardian-safe presentation of one current bus service. Internal route,
 * pattern, trip, bus, driver, tenant, and student identifiers are excluded.
 */
export interface GuardianBusServiceLine {
  busNumber: string;
  licensePlate: string | null;
  routeName: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  tripStatus: GuardianBusServiceTripStatus;
  locationState: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  stops: GuardianBusServiceStop[];
}
