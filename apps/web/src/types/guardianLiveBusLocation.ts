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
export type GuardianBusProgressSource = 'route_shape' | 'stop_sequence';
export type GuardianBusStopServiceState =
  'passed' | 'at_stop' | 'next' | 'upcoming' | 'unavailable';
export type GuardianBusStopEtaStatus =
  'available' | 'arriving_soon' | 'passed' | 'paused' | 'unavailable';

export interface GuardianBusServiceStop {
  name: string;
  order: number;
  latitude: number | null;
  longitude: number | null;
  plannedArrivalTime: string | null;
  serviceState: GuardianBusStopServiceState;
  etaStatus: GuardianBusStopEtaStatus;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  etaLabel: string;
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
  progressPercent: number | null;
  progressSource: GuardianBusProgressSource | null;
  nextStopName: string | null;
  nextStopOrder: number | null;
  etaUpdatedAt: string | null;
  stops: GuardianBusServiceStop[];
}
