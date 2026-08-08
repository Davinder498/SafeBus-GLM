import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { RouteServiceDay } from '@/types/transportation';

/**
 * Phase 6 transportation operations service.
 *
 * Browser-safe wrappers for the migration 0079 RPCs. No service-role keys are
 * used; all calls go through the authenticated Supabase client and are
 * enforced server-side by SECURITY DEFINER RPCs that derive identity from
 * auth.uid() and enforce tenant isolation.
 */

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

export type OperationalNoteTarget = 'route' | 'bus' | 'driver' | 'trip';
export type OperationalNoteType =
  'general' | 'schedule_change' | 'mechanical_note' | 'driver_coaching' | 'incident_followup';

const PROHIBITED_OPERATIONAL_TEXT =
  /\b(asn|alberta student number|student name|guardian name|health|medical|diagnos\w*|medicat\w*|asthma|allerg\w*|custody|home address|street address|date of birth|\bdob\b|phone number|email address|disability|\biep\b|behavio(?:u)?ral plan)\b/i;
const ADDRESS_LIKE_TEXT =
  /\b\d{1,6}\s+[a-z0-9.'-]+(?:\s+[a-z0-9.'-]+){0,4}\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|trail|tr|court|ct)\b/i;

export function operationalTextContainsProhibitedInformation(value: string): boolean {
  return PROHIBITED_OPERATIONAL_TEXT.test(value) || ADDRESS_LIKE_TEXT.test(value);
}

export interface OperationalNote {
  id: string;
  tenant_id: string;
  target_entity: OperationalNoteTarget;
  target_id: string;
  note_type: OperationalNoteType;
  note_text: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type TripExceptionType =
  | 'traffic_delay'
  | 'weather_delay'
  | 'mechanical_issue'
  | 'road_closure'
  | 'missed_stop'
  | 'late_arrival'
  | 'early_arrival'
  | 'student_issue'
  | 'other_operational';

export interface TripException {
  id: string;
  tenant_id: string;
  driver_trip_id: string;
  driver_id: string;
  exception_type: TripExceptionType;
  exception_detail: string | null;
  occurred_at: string;
  created_at: string;
}

export interface PreTripConfirmation {
  id: string;
  tenant_id: string;
  driver_trip_id: string;
  driver_id: string;
  bus_id: string;
  confirmed_at: string;
  created_at: string;
}

export interface DriverRouteAssignment {
  id: string;
  tenant_id: string;
  driver_id: string;
  bus_id: string;
  route_id: string;
  trip_type: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Admin assigns a substitute driver to an existing driver_route_assignment.
 * The original assignment is ended (status=inactive) and a new assignment is
 * created for the substitute driver, preserving bus/route/trip_type/effective
 * window. Refuses if the original assignment has an active/paused trip.
 */
export async function substituteDriver(
  assignmentId: string,
  substituteDriverId: string,
): Promise<DriverRouteAssignment> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('substitute_driver', {
    p_assignment_id: assignmentId,
    p_substitute_driver_id: substituteDriverId,
  });

  if (error) {
    const message = error.message ?? 'Could not assign the substitute driver.';
    if (message.includes('active trip')) {
      throw new Error('End or pause the active trip before substituting the driver.');
    }
    if (message.includes('not found') || message.includes('Admin tenant')) {
      throw new Error('This assignment could not be found in your organization.');
    }
    throw new Error(message);
  }
  return data as DriverRouteAssignment;
}

/**
 * Admin swaps the bus on an existing driver_route_assignment. The original
 * assignment is ended and a new one is created for the replacement bus.
 */
export async function replaceBus(
  assignmentId: string,
  replacementBusId: string,
): Promise<DriverRouteAssignment> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('replace_bus', {
    p_assignment_id: assignmentId,
    p_replacement_bus_id: replacementBusId,
  });

  if (error) {
    const message = error.message ?? 'Could not assign the replacement bus.';
    if (message.includes('active trip')) {
      throw new Error('End or pause the active trip before replacing the bus.');
    }
    if (message.includes('not found') || message.includes('Admin tenant')) {
      throw new Error('This assignment could not be found in your organization.');
    }
    throw new Error(message);
  }
  return data as DriverRouteAssignment;
}

/**
 * Admin revokes an active guardian-student link. Sets status=inactive and
 * records an audit event. The reason is validated for prohibited content.
 */
export async function revokeGuardianAccess(
  studentGuardianId: string,
  reason?: string | null,
): Promise<{ id: string; status: string }> {
  if (reason && operationalTextContainsProhibitedInformation(reason)) {
    throw new Error('The reason contains prohibited student information.');
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc('revoke_guardian_access', {
    p_student_guardian_id: studentGuardianId,
    p_reason: reason ?? null,
  });

  if (error) {
    const message = error.message ?? 'Could not revoke guardian access.';
    if (message.includes('prohibited')) {
      throw new Error('The reason contains prohibited student information.');
    }
    if (message.includes('already inactive')) {
      throw new Error('This guardian link is already inactive.');
    }
    if (message.includes('not found') || message.includes('Admin tenant')) {
      throw new Error('This guardian link could not be found in your organization.');
    }
    throw new Error(message);
  }
  return data as { id: string; status: string };
}

/**
 * Fetch operational notes for a target entity (route, bus, driver, trip).
 * Tenant-scoped by RLS.
 */
export async function getOperationalNotes(
  targetEntity: OperationalNoteTarget,
  targetId: string,
): Promise<OperationalNote[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('operational_notes')
    .select(
      'id, tenant_id, target_entity, target_id, note_type, note_text, created_by, created_at, updated_at',
    )
    .eq('target_entity', targetEntity)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as OperationalNote[];
}

/**
 * Create a controlled-format operational note. The server enforces the
 * prohibited-content guard; this client-side helper performs a friendly
 * pre-check so the user gets immediate feedback.
 */
export async function createOperationalNote(input: {
  tenantId: string;
  targetEntity: OperationalNoteTarget;
  targetId: string;
  noteType: OperationalNoteType;
  noteText: string;
}): Promise<OperationalNote> {
  if (operationalTextContainsProhibitedInformation(input.noteText)) {
    throw new Error(
      'This note appears to contain prohibited student information and was rejected.',
    );
  }
  const client = requireSupabase();
  const { data, error } = await client
    .from('operational_notes')
    .insert({
      tenant_id: input.tenantId,
      target_entity: input.targetEntity,
      target_id: input.targetId,
      note_type: input.noteType,
      note_text: input.noteText,
      created_by: (await client.auth.getUser()).data.user?.id,
    })
    .select(
      'id, tenant_id, target_entity, target_id, note_type, note_text, created_by, created_at, updated_at',
    )
    .single();

  if (error) {
    const message = error.message ?? 'Could not save the note.';
    if (message.includes('prohibited') || message.includes('no_prohibited_pii')) {
      throw new Error(
        'This note appears to contain prohibited student information and was rejected.',
      );
    }
    throw new Error(message);
  }
  return data as OperationalNote;
}

/**
 * Driver records a controlled exception on their own active/paused trip.
 */
export async function recordTripException(input: {
  tripId: string;
  exceptionType: TripExceptionType;
  exceptionDetail?: string | null;
}): Promise<TripException> {
  if (
    input.exceptionDetail &&
    operationalTextContainsProhibitedInformation(input.exceptionDetail)
  ) {
    throw new Error('The detail contains prohibited student information.');
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc('record_trip_exception', {
    p_trip_id: input.tripId,
    p_exception_type: input.exceptionType,
    p_exception_detail: input.exceptionDetail ?? null,
  });

  if (error) {
    const message = error.message ?? 'Could not record the exception.';
    if (message.includes('prohibited')) {
      throw new Error('The detail contains prohibited student information.');
    }
    if (message.includes('active or paused')) {
      throw new Error('Exceptions can only be recorded on active or paused trips.');
    }
    if (message.includes('not found') || message.includes('Only an active driver')) {
      throw new Error('This trip could not be found for your account.');
    }
    throw new Error(message);
  }
  return data as TripException;
}

/**
 * Driver confirms the pre-trip inspection for their own active/paused trip.
 * Idempotent.
 */
export async function confirmPreTrip(tripId: string): Promise<PreTripConfirmation> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('confirm_pre_trip', { p_trip_id: tripId });

  if (error) {
    const message = error.message ?? 'Could not confirm the pre-trip inspection.';
    if (message.includes('not found') || message.includes('Only an active driver')) {
      throw new Error('This trip could not be found for your account.');
    }
    throw new Error(message);
  }
  return data as PreTripConfirmation;
}

export async function getPreTripConfirmation(tripId: string): Promise<PreTripConfirmation | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('pre_trip_confirmations')
    .select('id, tenant_id, driver_trip_id, driver_id, bus_id, confirmed_at, created_at')
    .eq('driver_trip_id', tripId)
    .maybeSingle();
  if (error) throw new Error('Unable to load pre-trip confirmation.');
  return (data as PreTripConfirmation | null) ?? null;
}

export async function getTripExceptions(tripId: string): Promise<TripException[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('trip_exceptions')
    .select(
      'id, tenant_id, driver_trip_id, driver_id, exception_type, exception_detail, occurred_at, created_at',
    )
    .eq('driver_trip_id', tripId)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error('Unable to load trip exceptions.');
  return (data ?? []) as TripException[];
}

export type TripOperationalStatusValue = 'normal' | 'late' | 'missing';
export type TripOperationalReason =
  | 'traffic'
  | 'weather'
  | 'mechanical'
  | 'driver_unavailable'
  | 'bus_unavailable'
  | 'dispatch_unknown'
  | 'other_operational';

export interface AdminTripOperationalStatus {
  trip_id: string;
  bus_label: string;
  route_name: string;
  trip_status: 'active' | 'paused';
  operational_status: TripOperationalStatusValue;
  reason_code: TripOperationalReason | null;
  status_set_at: string | null;
}

export async function getVisibleRouteServiceDays(): Promise<RouteServiceDay[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('route_service_days')
    .select('id, tenant_id, route_id, day_of_week, status, created_at, updated_at')
    .order('route_id')
    .order('day_of_week');

  if (error) throw new Error('Unable to load route service days.');
  return (data ?? []) as RouteServiceDay[];
}

export async function saveRouteServiceDays(input: {
  tenantId: string;
  routeId: string;
  activeDays: number[];
}): Promise<void> {
  const client = requireSupabase();
  const active = new Set(input.activeDays);
  const { error } = await client.from('route_service_days').upsert(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenant_id: input.tenantId,
      route_id: input.routeId,
      day_of_week: dayOfWeek,
      status: active.has(dayOfWeek) ? 'active' : 'inactive',
    })),
    { onConflict: 'route_id,day_of_week' },
  );

  if (error) throw new Error('Unable to save route service days.');
}

export async function getAdminActiveTripOperationalStatuses(): Promise<
  AdminTripOperationalStatus[]
> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_admin_active_trip_operational_statuses');
  if (error) throw new Error('Unable to load dispatch status.');
  return (data ?? []) as AdminTripOperationalStatus[];
}

export async function setTripOperationalStatus(input: {
  tripId: string;
  status: TripOperationalStatusValue;
  reason: TripOperationalReason | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('set_trip_operational_status', {
    p_driver_trip_id: input.tripId,
    p_operational_status: input.status,
    p_reason_code: input.status === 'normal' ? null : input.reason,
  });
  if (error) throw new Error(error.message ?? 'Unable to update dispatch status.');
}
