/**
 * SafeBus Alberta — Zod validation schemas.
 *
 * These mirror the API contracts in @safebus/types/api-contracts and validate
 * client input before approved server operations.
 */

import { z } from 'zod';

// ─── Issue Report ──────────────────────────────────────────────────────────

export const issueReportSchema = z.object({
  tripId: z.string().uuid(),
  driverId: z.string().uuid(),
  issueType: z.enum(['delay', 'breakdown', 'road_blocked', 'weather', 'student_issue', 'other']),
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
  consentType: z.enum(['student_data_collection']),
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

export type IssueReportInput = z.infer<typeof issueReportSchema>;
export type StartTripInput = z.infer<typeof startTripSchema>;
export type EndTripInput = z.infer<typeof endTripSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type GrantConsentInput = z.infer<typeof grantConsentSchema>;
export type CsvImportPreviewInput = z.infer<typeof csvImportPreviewSchema>;
