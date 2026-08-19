/**
 * SafeBus Alberta — API request/response contracts.
 *
 * Shared request and response contracts for approved SafeBus operations.
 */

// ─── Driver Issue Report ───────────────────────────────────────────────────

export interface IssueReportRequest {
  tripId: string;
  driverId: string;
  issueType: 'delay' | 'breakdown' | 'road_blocked' | 'weather' | 'student_issue' | 'other';
  note?: string;
  latitude?: number | null;
  longitude?: number | null;
  timestamp: string;
}

export interface IssueReportResponse {
  accepted: boolean;
  alertId?: string;
}

// ─── Trip State Transitions ────────────────────────────────────────────────

export interface StartTripRequest {
  tripId: string;
  driverId: string;
  /** ISO 8601 timestamp from the device. */
  timestamp: string;
}

export interface StartTripResponse {
  accepted: boolean;
  tripStatus?: string;
  rejectionReason?: 'not_authenticated' | 'driver_not_assigned' | 'trip_already_active';
}

export interface EndTripRequest {
  tripId: string;
  driverId: string;
  timestamp: string;
}

export interface EndTripResponse {
  accepted: boolean;
  summary?: EndTripSummary;
  rejectionReason?: 'not_authenticated' | 'driver_not_assigned' | 'trip_not_active';
}

export interface EndTripSummary {
  studentsPickedUp: number;
  studentsDroppedOff: number;
  unresolvedAlerts: number;
  gpsSyncStatus: 'live' | 'stale' | 'lost' | 'offline';
}

// ─── CSV Import ────────────────────────────────────────────────────────────

export interface CsvImportPreviewRequest {
  importType:
    | 'students'
    | 'guardians'
    | 'student_guardians'
    | 'buses'
    | 'drivers'
    | 'routes'
    | 'route_stops'
    | 'student_route_assignments';
  fileContent: string;
}

export interface CsvImportPreviewResponse {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  preview: Record<string, unknown>[];
  errors: { row: number; field: string; message: string }[];
}

export interface CsvImportConfirmRequest {
  importType: CsvImportPreviewRequest['importType'];
  fileContent: string;
}

export interface CsvImportConfirmResponse {
  importId: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  fullName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AcceptInvitationRequest {
  invitationToken: string;
  password: string;
  fullName: string;
}

// ─── Consent (Alberta FOIP/PIPA) ───────────────────────────────────────────

export interface GrantConsentRequest {
  studentId: string;
  consentType: 'student_data_collection';
  termsVersionId: string;
}

export interface RevokeConsentRequest {
  consentId: string;
}

// ─── Data Subject Access Request (DSAR) ────────────────────────────────────

export interface DsarRequest {
  profileId: string;
  studentId?: string;
  requestType: 'access' | 'export' | 'deletion';
}

export interface DsarResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed';
  estimatedCompletionDate: string;
}
