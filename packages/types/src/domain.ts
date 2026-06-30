/**
 * SafeBus Alberta — Domain types.
 *
 * These mirror the database schema (see supabase/migrations/).
 * All entities are tenant-scoped unless noted otherwise.
 */

import type {
  BadgeStatus,
  ConsentType,
  PickupStatus,
  PrivacyRegime,
  RouteDirection,
  ScanEventType,
  TermsType,
  TripStatus,
} from './status.ts';
import type { UserRole } from './roles.ts';

// ─── Tenant & Schools ──────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  settings: TenantSettings;
  created_at: string;
}

export interface TenantSettings {
  privacy_regime: PrivacyRegime;
  gps_retention_days: number;
  ping_interval_seconds: number;
  stale_threshold_seconds: number;
  lost_threshold_seconds: number;
  notification_channels: {
    in_app: boolean;
    push: boolean;
    email: boolean;
  };
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  privacy_regime: 'pipa',
  gps_retention_days: 30,
  ping_interval_seconds: 5,
  stale_threshold_seconds: 30,
  lost_threshold_seconds: 60,
  notification_channels: {
    in_app: true,
    push: true,
    email: true,
  },
};

export interface School {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  created_at: string;
}

// ─── Profiles & Auth ───────────────────────────────────────────────────────

export interface Profile {
  id: string;
  auth_user_id: string;
  tenant_id: string | null;
  role: UserRole;
  email: string;
  full_name: string;
  phone: string | null;
  status: 'active' | 'suspended' | 'invited';
  created_at: string;
}

// ─── Students & Guardians ──────────────────────────────────────────────────

export interface Student {
  id: string;
  tenant_id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  /** Alberta Student Number — restricted metadata, never public/driver-facing. */
  asn_restricted: string | null;
  status: 'active' | 'inactive' | 'transferred';
  created_at: string;
}

export interface Guardian {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export interface StudentGuardian {
  id: string;
  student_id: string;
  guardian_id: string;
  relationship: string | null;
  created_at: string;
}

// ─── Buses & Drivers ───────────────────────────────────────────────────────

export interface Bus {
  id: string;
  tenant_id: string;
  bus_number: string;
  capacity: number;
  status: 'active' | 'maintenance' | 'retired';
  created_at: string;
}

export interface Driver {
  id: string;
  tenant_id: string;
  profile_id: string;
  license_number: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

// ─── Routes & Stops ────────────────────────────────────────────────────────

export interface Route {
  id: string;
  tenant_id: string;
  school_id: string;
  name: string;
  direction: RouteDirection;
  created_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  scheduled_time: string | null;
  created_at: string;
}

export interface StudentRouteAssignment {
  id: string;
  student_id: string;
  route_id: string;
  stop_id: string | null;
  created_at: string;
}

// ─── Trips & Live Location ─────────────────────────────────────────────────

export interface Trip {
  id: string;
  tenant_id: string;
  route_id: string;
  bus_id: string;
  driver_id: string;
  status: TripStatus;
  scheduled_start: string;
  actual_start: string | null;
  actual_end: string | null;
  trip_date: string;
  created_at: string;
}

export interface LiveBusLocation {
  bus_id: string;
  trip_id: string;
  tenant_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  battery_level: number | null;
  recorded_at: string;
  updated_at: string;
}

export interface TripLocationHistoryEntry {
  trip_id: string;
  bus_id: string;
  tenant_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  battery_level: number | null;
  recorded_at: string;
  location_source: 'driver_web' | 'driver_mobile' | 'hardware_tracker';
}

// ─── Badges & Scan Events ───────────────────────────────────────────────────

export interface StudentBadge {
  id: string;
  student_id: string;
  /** SHA-256 hash of the QR token. Plaintext never stored. */
  token_hash: string;
  status: BadgeStatus;
  issued_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface StudentScanEvent {
  id: string;
  trip_id: string;
  student_id: string;
  badge_id: string | null;
  driver_id: string;
  event_type: ScanEventType;
  is_manual: boolean;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string;
  created_at: string;
}

// ─── Alerts & Notifications ────────────────────────────────────────────────

export interface TripAlert {
  id: string;
  trip_id: string;
  tenant_id: string;
  alert_type:
    | 'gps_stale'
    | 'gps_lost'
    | 'trip_not_started'
    | 'bus_breakdown'
    | 'road_blocked'
    | 'route_delayed'
    | 'manual_scan_override'
    | 'notification_failed'
    | 'student_issue'
    | 'driver_reported_issue';
  severity: 'urgent' | 'warning' | 'info';
  message: string;
  status: 'active' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface Notification {
  id: string;
  tenant_id: string;
  profile_id: string;
  student_id: string | null;
  title: string;
  message: string;
  type: string;
  status: 'unread' | 'read';
  created_at: string;
  read_at: string | null;
}

// ─── Audit & Imports ───────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ImportRecord {
  id: string;
  tenant_id: string;
  import_type:
    | 'students'
    | 'guardians'
    | 'student_guardians'
    | 'buses'
    | 'drivers'
    | 'routes'
    | 'route_stops'
    | 'student_route_assignments';
  file_name: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  status: 'pending' | 'validating' | 'completed' | 'failed';
  created_at: string;
  created_by: string;
}

// ─── Consent & Terms (Alberta FOIP/PIPA) ───────────────────────────────────

export interface Consent {
  id: string;
  tenant_id: string;
  profile_id: string;
  student_id: string;
  consent_type: ConsentType;
  granted_at: string;
  revoked_at: string | null;
  terms_version_id: string;
  ip_address: string | null;
}

export interface TermsVersion {
  id: string;
  version: string;
  type: TermsType;
  effective_date: string;
  content: string;
  pdf_url: string | null;
  created_at: string;
}

export interface TermsAcceptance {
  id: string;
  profile_id: string;
  terms_version_id: string;
  accepted_at: string;
  ip_address: string | null;
}

export interface SecurityIncident {
  id: string;
  tenant_id: string | null;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'reported';
  detected_at: string;
  reported_at: string | null;
  affected_count: number | null;
  created_at: string;
}

// ─── Helper Types ──────────────────────────────────────────────────────────

/** A student with their pickup status for a specific trip. */
export interface StudentWithPickupStatus extends Student {
  pickup_status: PickupStatus;
  scan_event_id: string | null;
  scanned_at: string | null;
  is_manual: boolean;
}

/** A trip with related entities for display. */
export interface TripWithRelations extends Trip {
  route?: Route;
  bus?: Bus;
  driver?: Driver & { profile?: Profile };
  school?: School;
  picked_up_count?: number;
  total_students?: number;
  alerts?: TripAlert[];
}
