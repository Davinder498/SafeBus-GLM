import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  GuardianBusAssignmentState,
  GuardianBusProgressSource,
  GuardianBusServiceLine,
  GuardianBusServiceStop,
  GuardianBusStopEtaStatus,
  GuardianBusStopServiceState,
  GuardianBusVisibility,
  GuardianLiveBusLocationState,
  GuardianStudentTripStatus,
} from '@/types/guardianLiveBusLocation';

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export interface GuardianBusVisibilityRpcRow {
  student_id: string;
  student_name: string;
  student_grade: string | null;
  assignment_state: GuardianBusAssignmentState;
  bus_number: string | null;
  license_plate: string | null;
  has_active_trip: boolean;
  location_state: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
  location_age_seconds: number | null;
  eta_status: string | null;
  eta_label: string | null;
  student_trip_status: GuardianStudentTripStatus;
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  last_event_time: string | null;
}

export function mapGuardianBusVisibilityRow(
  row: GuardianBusVisibilityRpcRow,
): GuardianBusVisibility {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    studentGrade: row.student_grade,
    assignmentState: row.assignment_state,
    busNumber: row.bus_number,
    licensePlate: row.license_plate,
    hasActiveTrip: row.has_active_trip,
    locationState: row.location_state,
    latitude: row.latitude,
    longitude: row.longitude,
    locationRecordedAt: row.location_recorded_at,
    locationAgeSeconds: row.location_age_seconds,
    etaStatus: row.eta_status,
    etaLabel: row.eta_label,
    studentTripStatus: row.student_trip_status,
    pickupEventTime: row.pickup_event_time,
    dropoffEventTime: row.dropoff_event_time,
    lastEventTime: row.last_event_time,
  };
}

/** Load the guardian's linked students and bus-only visibility state. */
export async function fetchGuardianBusVisibility(
  signal?: AbortSignal,
): Promise<GuardianBusVisibility[]> {
  const request = requireSupabase().rpc('get_guardian_bus_visibility_v2');
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load guardian bus visibility', error);
    throw new Error('We could not load your bus information. Please try again.');
  }
  return ((data ?? []) as GuardianBusVisibilityRpcRow[]).map(mapGuardianBusVisibilityRow);
}

// Retain the hook-facing name while using the single bus-first server contract.
export const fetchGuardianLiveBusLocations = fetchGuardianBusVisibility;

interface GuardianBusServiceStopRpcRow {
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

interface GuardianBusServiceLineRpcRow {
  busNumber: string;
  licensePlate: string | null;
  routeName: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  tripStatus: 'active' | 'paused' | 'inactive';
  locationState: GuardianLiveBusLocationState;
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  progressPercent: number | null;
  progressSource: GuardianBusProgressSource | null;
  nextStopName: string | null;
  nextStopOrder: number | null;
  etaUpdatedAt: string | null;
  stops: GuardianBusServiceStopRpcRow[];
}

function isFiniteCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function mapGuardianBusServiceStop(row: GuardianBusServiceStopRpcRow): GuardianBusServiceStop {
  return {
    name: row.name,
    order: row.order,
    latitude: isFiniteCoordinate(row.latitude, -90, 90) ? row.latitude : null,
    longitude: isFiniteCoordinate(row.longitude, -180, 180) ? row.longitude : null,
    plannedArrivalTime: row.plannedArrivalTime,
    serviceState: row.serviceState ?? 'unavailable',
    etaStatus: row.etaStatus ?? 'unavailable',
    etaMinMinutes: Number.isInteger(row.etaMinMinutes) ? row.etaMinMinutes : null,
    etaMaxMinutes: Number.isInteger(row.etaMaxMinutes) ? row.etaMaxMinutes : null,
    etaLabel: row.etaLabel || 'ETA unavailable',
  };
}

export function mapGuardianBusServiceLine(
  row: GuardianBusServiceLineRpcRow,
): GuardianBusServiceLine {
  return {
    busNumber: row.busNumber,
    licensePlate: row.licensePlate,
    routeName: row.routeName,
    tripName: row.tripName,
    direction: row.direction,
    tripStatus: row.tripStatus,
    locationState: row.locationState,
    latitude: isFiniteCoordinate(row.latitude, -90, 90) ? row.latitude : null,
    longitude: isFiniteCoordinate(row.longitude, -180, 180) ? row.longitude : null,
    locationRecordedAt: row.locationRecordedAt,
    progressPercent:
      typeof row.progressPercent === 'number' && Number.isFinite(row.progressPercent)
        ? Math.min(100, Math.max(0, row.progressPercent))
        : null,
    progressSource:
      row.progressSource === 'route_shape' || row.progressSource === 'stop_sequence'
        ? row.progressSource
        : null,
    nextStopName: row.nextStopName,
    nextStopOrder: Number.isInteger(row.nextStopOrder) ? row.nextStopOrder : null,
    etaUpdatedAt: row.etaUpdatedAt,
    stops: (row.stops ?? []).map(mapGuardianBusServiceStop),
  };
}

/** Load ordered guardian-safe service lines for one assigned bus number. */
export async function fetchGuardianBusServiceLines(
  busNumber: string,
  signal?: AbortSignal,
): Promise<GuardianBusServiceLine[]> {
  const normalizedBusNumber = busNumber.trim();
  if (!normalizedBusNumber) return [];

  const request = requireSupabase().rpc('get_guardian_bus_service_lines', {
    p_bus_number: normalizedBusNumber,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) {
    if (import.meta.env.DEV) console.error('Failed to load guardian bus service lines', error);
    throw new Error('We could not load this bus route. Please try again.');
  }

  return ((data ?? []) as GuardianBusServiceLineRpcRow[]).map(mapGuardianBusServiceLine);
}
