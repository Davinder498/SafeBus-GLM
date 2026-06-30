/**
 * SafeBus Alberta — Zod validation schemas.
 *
 * These mirror the API contracts in @safebus/types/api-contracts.
 * Used by both the client (before sending) and Edge Functions (before processing).
 */

import { z } from 'zod';

// ─── GPS Location Ping ─────────────────────────────────────────────────────

export const locationPingSchema = z.object({
  tripId: z.string().uuid(),
  busId: z.string().uuid(),
  driverId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  accuracy: z.number().min(0).nullable().optional(),
  batteryLevel: z.number().min(0).max(1).nullable().optional(),
  recordedAt: z.string().datetime(),
  locationSource: z.enum(['driver_web', 'driver_mobile', 'hardware_tracker']),
});

// ─── QR Scan ───────────────────────────────────────────────────────────────

export const scanRequestSchema = z.object({
  qrToken: z.string().min(16, 'QR token is too short'),
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  timestamp: z.string().datetime(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

// ─── Manual Override ───────────────────────────────────────────────────────

export const manualOverrideSchema = z.object({
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  studentId: z.string().uuid(),
  eventType: z.enum(['pickup', 'boarding', 'dropoff']),
  timestamp: z.string().datetime(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  reason: z.string().max(500).optional(),
});

// ─── Issue Report ──────────────────────────────────────────────────────────

export const issueReportSchema = z.object({
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  issueType: z.enum([
    'delay',
    'breakdown',
    'road_blocked',
    'weather',
    'student_issue',
    'other',
  ]),
  note: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timestamp: z.string().datetime(),
});

// ─── Trip Transitions ──────────────────────────────────────────────────────

export const startTripSchema = z.object({
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export const endTripSchema = z.object({
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const acceptInvitationSchema = z.object({
  invitationToken: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Enter your full name'),
});

// ─── Consent ───────────────────────────────────────────────────────────────

export const grantConsentSchema = z.object({
  studentId: z.string().uuid(),
  consentType: z.enum([
    'student_data_collection',
    'pickup_dropoff_tracking',
    'badge_issuance',
    'notifications',
  ]),
  termsVersionId: z.string().uuid(),
});

// ─── CSV Import ────────────────────────────────────────────────────────────

export const csvImportPreviewSchema = z.object({
  importType: z.enum([
    'students',
    'guardians',
    'student_guardians',
    'buses',
    'drivers',
    'routes',
    'route_stops',
    'student_route_assignments',
  ]),
  fileContent: z.string().min(1, 'CSV content is required'),
});

// ─── Badge Generation ──────────────────────────────────────────────────────

export const generateBadgeSchema = z.object({
  studentId: z.string().uuid(),
  replaceExisting: z.boolean().optional(),
});

export type LocationPingInput = z.infer<typeof locationPingSchema>;
export type ScanRequestInput = z.infer<typeof scanRequestSchema>;
export type ManualOverrideInput = z.infer<typeof manualOverrideSchema>;
export type IssueReportInput = z.infer<typeof issueReportSchema>;
export type StartTripInput = z.infer<typeof startTripSchema>;
export type EndTripInput = z.infer<typeof endTripSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type GrantConsentInput = z.infer<typeof grantConsentSchema>;
export type CsvImportPreviewInput = z.infer<typeof csvImportPreviewSchema>;
export type GenerateBadgeInput = z.infer<typeof generateBadgeSchema>;
