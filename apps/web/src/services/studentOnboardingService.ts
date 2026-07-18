import { supabase, supabaseConfigError } from '@/lib/supabase';
import { inviteTenantMember } from '@/services/onboardingService';
import type { RouteType } from '@/types/transportation';

export type GuardianRelationship = 'mother' | 'father' | 'guardian' | 'caregiver' | 'other';

export interface GuardianSearchOption {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  profile_status: 'invited' | 'active';
}

export interface RouteSearchOption {
  id: string;
  route_name: string;
  route_code: string;
  route_type: RouteType;
}

export interface BusSearchOption {
  id: string;
  bus_number: string;
  license_plate: string | null;
  capacity: number | null;
}

export interface RouteStopOption {
  id: string;
  stop_name: string;
  stop_order: number;
  planned_arrival_time: string | null;
}

export type GuardianChoice =
  | { mode: 'none' }
  | { mode: 'existing'; id: string; relationship: GuardianRelationship }
  | {
      mode: 'new';
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      relationship: GuardianRelationship;
    };

export type RouteChoice =
  | { mode: 'existing'; id: string }
  | { mode: 'new'; name: string; code: string; type: RouteType };

export type BusChoice =
  | { mode: 'existing'; id: string }
  | {
      mode: 'new';
      number: string;
      licensePlate: string;
      capacity: string;
    };

export type StopChoice =
  | { mode: 'none' }
  | { mode: 'existing'; id: string }
  | { mode: 'new'; name: string; plannedTime: string };

export type TransportationChoice =
  | { enabled: false }
  | {
      enabled: true;
      route: RouteChoice;
      bus: BusChoice;
      pickupStop: StopChoice;
      dropoffStop: StopChoice;
      tripType: 'morning' | 'evening';
      effectiveFrom: string;
    };

export interface CreateStudentOnboardingInput {
  student: {
    firstName: string;
    lastName: string;
    preferredName: string;
    grade: string;
    schoolId: string;
  };
  guardian: GuardianChoice;
  transportation: TransportationChoice;
}

export interface StudentOnboardingResult {
  studentId: string;
  guardianLinkId: string | null;
  routeId: string | null;
  busId: string | null;
  busServiceId: string | null;
  studentBusAssignmentId: string | null;
  pickupStopId: string | null;
  dropoffStopId: string | null;
  guardianInvitationStatus: string | null;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

async function search<T>(rpcName: string, query: string): Promise<T[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const { data, error } = await client().rpc(rpcName, {
    p_search: normalized,
    p_limit: 20,
  });
  if (error) throw new Error('Unable to search your organization records.');
  return (data ?? []) as T[];
}

export function searchAdminGuardians(query: string) {
  return search<GuardianSearchOption>('search_admin_guardians', query);
}

export function searchAdminRoutes(query: string) {
  return search<RouteSearchOption>('search_admin_routes', query);
}

export function searchAdminBuses(query: string) {
  return search<BusSearchOption>('search_admin_buses', query);
}

export async function getAdminRouteStopOptions(routeId: string): Promise<RouteStopOption[]> {
  if (!routeId) return [];
  const { data, error } = await client().rpc('get_admin_route_stop_options', {
    p_route_id: routeId,
  });
  if (error) throw new Error('Unable to load stops for the selected route.');
  return (data ?? []) as RouteStopOption[];
}

function rpcPayload(input: CreateStudentOnboardingInput, guardianId: string | null) {
  const guardian =
    input.guardian.mode === 'none'
      ? { id: null, relationship: 'guardian' }
      : { id: guardianId, relationship: input.guardian.relationship };

  if (!input.transportation.enabled) {
    return {
      student: input.student,
      guardian,
      transportation: { enabled: false },
    };
  }

  const route =
    input.transportation.route.mode === 'existing'
      ? { id: input.transportation.route.id }
      : {
          id: null,
          name: input.transportation.route.name,
          code: input.transportation.route.code,
          type: input.transportation.route.type,
        };
  const bus =
    input.transportation.bus.mode === 'existing'
      ? { id: input.transportation.bus.id }
      : {
          id: null,
          number: input.transportation.bus.number,
          licensePlate: input.transportation.bus.licensePlate,
          capacity: input.transportation.bus.capacity,
        };

  return {
    student: input.student,
    guardian,
    transportation: {
      enabled: true,
      route,
      bus,
      pickupStop: input.transportation.pickupStop,
      dropoffStop: input.transportation.dropoffStop,
      tripType: input.transportation.tripType,
      effectiveFrom: input.transportation.effectiveFrom,
    },
  };
}

function describeOnboardingError(message: string, guardianWasProvisioned: boolean): Error {
  const suffix = guardianWasProvisioned
    ? ' The guardian account was prepared; reopen this form and select that guardian by email to retry.'
    : '';
  if (message.includes('routes_tenant_route_code_unique')) {
    return new Error(`That route code already exists in your organization.${suffix}`);
  }
  if (message.includes('buses_tenant_bus_number_unique')) {
    return new Error(`That bus number already exists in your organization.${suffix}`);
  }
  if (message.includes('not found in your tenant') || message.includes('not found on the selected route')) {
    return new Error(`One of the selected records is no longer available. Search and select it again.${suffix}`);
  }
  if (message.includes('Only a tenant administrator')) {
    return new Error('Only a tenant administrator can complete this onboarding workflow.');
  }
  return new Error(`We could not complete student onboarding. No partial student or transportation records were saved.${suffix}`);
}

export async function createStudentOnboarding(
  input: CreateStudentOnboardingInput,
): Promise<StudentOnboardingResult> {
  let guardianId: string | null =
    input.guardian.mode === 'existing' ? input.guardian.id : null;
  let guardianInvitationStatus: string | null = null;
  let guardianWasProvisioned = false;

  if (input.guardian.mode === 'new') {
    const invitation = await inviteTenantMember({
      role: 'guardian',
      firstName: input.guardian.firstName.trim(),
      lastName: input.guardian.lastName.trim(),
      email: input.guardian.email.trim(),
      phone: input.guardian.phone.trim(),
    });
    if (!invitation.guardianId) {
      throw new Error('The guardian invitation was sent, but the guardian record was not returned.');
    }
    guardianId = invitation.guardianId;
    guardianInvitationStatus = invitation.status;
    guardianWasProvisioned = true;
  }

  const { data, error } = await client().rpc('admin_create_student_onboarding', {
    p_payload: rpcPayload(input, guardianId),
  });

  if (error) {
    if (import.meta.env.DEV) console.error('Student onboarding RPC failed', error);
    throw describeOnboardingError(error.message ?? '', guardianWasProvisioned);
  }

  return {
    ...(data as Omit<StudentOnboardingResult, 'guardianInvitationStatus'>),
    guardianInvitationStatus,
  };
}
