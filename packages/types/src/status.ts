/**
 * SafeBus Alberta — Status language.
 *
 * SINGLE SOURCE OF TRUTH for all status strings across web, mobile, and backend.
 * The UI Plan requires consistent wording — never use raw enum values in the UI.
 *
 * See: docs/ARCHITECTURE.md §11, docs/UI_PLAN.md §11
 */

// ─── Trip Status ───────────────────────────────────────────────────────────

export type TripStatus =
  | 'scheduled'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'cancelled'
  | 'gps_stale'
  | 'gps_lost';

export const TRIP_STATUS_VALUES: readonly TripStatus[] = [
  'scheduled',
  'active',
  'delayed',
  'completed',
  'cancelled',
  'gps_stale',
  'gps_lost',
] as const;

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  scheduled: 'Scheduled',
  active: 'Active',
  delayed: 'Delayed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  gps_stale: 'GPS Stale',
  gps_lost: 'GPS Lost',
};

/** Trips that are considered "in progress" for GPS tracking purposes. */
export const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = ['active', 'delayed'] as const;

export function isTripActive(status: TripStatus): boolean {
  return (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status);
}

// ─── GPS Status ────────────────────────────────────────────────────────────

export type GpsStatus =
  | 'live'
  | 'stale'
  | 'lost'
  | 'permission_needed'
  | 'syncing'
  | 'offline';

export const GPS_STATUS_VALUES: readonly GpsStatus[] = [
  'live',
  'stale',
  'lost',
  'permission_needed',
  'syncing',
  'offline',
] as const;

export const GPS_STATUS_LABELS: Record<GpsStatus, string> = {
  live: 'Live',
  stale: 'Stale',
  lost: 'Lost',
  permission_needed: 'Permission Needed',
  syncing: 'Syncing',
  offline: 'Offline',
};

// ─── Location Source ───────────────────────────────────────────────────────

export type LocationSource = 'driver_web' | 'driver_mobile' | 'hardware_tracker';

export const LOCATION_SOURCE_VALUES: readonly LocationSource[] = [
  'driver_web',
  'driver_mobile',
  'hardware_tracker',
] as const;

export const LOCATION_SOURCE_LABELS: Record<LocationSource, string> = {
  driver_web: 'Driver Web (Demo)',
  driver_mobile: 'Driver Mobile',
  hardware_tracker: 'Hardware Tracker',
};

// ─── Alert Severity ────────────────────────────────────────────────────────

export type AlertSeverity = 'urgent' | 'warning' | 'info';

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  urgent: 'Urgent',
  warning: 'Warning',
  info: 'Info',
};

export type AlertType =
  | 'gps_stale'
  | 'gps_lost'
  | 'trip_not_started'
  | 'bus_breakdown'
  | 'road_blocked'
  | 'route_delayed'
  | 'student_issue'
  | 'driver_reported_issue';

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  gps_stale: 'GPS Stale',
  gps_lost: 'GPS Lost',
  trip_not_started: 'Trip Not Started',
  bus_breakdown: 'Bus Breakdown',
  road_blocked: 'Road Blocked',
  route_delayed: 'Route Delayed',
  student_issue: 'Student Issue',
  driver_reported_issue: 'Driver Reported Issue',
};

export function alertSeverityForType(type: AlertType): AlertSeverity {
  switch (type) {
    case 'gps_lost':
    case 'bus_breakdown':
    case 'trip_not_started':
    case 'road_blocked':
      return 'urgent';
    case 'gps_stale':
    case 'route_delayed':
      return 'warning';
    case 'student_issue':
    case 'driver_reported_issue':
      return 'info';
  }
}

// ─── Route Direction ────────────────────────────────────────────────────────

export type RouteDirection = 'AM' | 'PM';

export const ROUTE_DIRECTION_LABELS: Record<RouteDirection, string> = {
  AM: 'Morning',
  PM: 'Afternoon',
};

// ─── Privacy Regime (Alberta) ──────────────────────────────────────────────

export type PrivacyRegime = 'foip' | 'pipa';

export const PRIVACY_REGIME_LABELS: Record<PrivacyRegime, string> = {
  foip: 'FOIP (Public Body)',
  pipa: 'PIPA (Private Organization)',
};

// ─── Consent Types ──────────────────────────────────────────────────────────

export type ConsentType = 'student_data_collection';

export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  student_data_collection: 'Student Data Collection',
};

// ─── Terms Document Types ──────────────────────────────────────────────────

export type TermsType =
  | 'privacy_policy'
  | 'terms_of_service'
  | 'guardian_consent'
  | 'driver_terms'
  | 'tenant_agreement';

export const TERMS_TYPE_LABELS: Record<TermsType, string> = {
  privacy_policy: 'Privacy Policy',
  terms_of_service: 'Terms of Service',
  guardian_consent: 'Guardian Consent Form',
  driver_terms: 'Driver Terms',
  tenant_agreement: 'Tenant Agreement',
};
