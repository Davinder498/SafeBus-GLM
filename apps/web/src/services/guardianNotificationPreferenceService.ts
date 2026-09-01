import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  GuardianNotificationPreference,
  GuardianNotificationPreferenceInput,
} from '@/types/guardianNotificationPreference';

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export interface GuardianNotificationPreferenceRpcRow {
  student_id: string;
  student_name: string;
  email_enabled: boolean;
  email_pickup: boolean;
  email_dropoff: boolean;
  push_pickup_dropoff: boolean;
  push_trip_status: boolean;
  push_service_changes: boolean;
  preferences_set_at: string | null;
  access_expires_at: string | null;
}

export function mapGuardianNotificationPreference(
  row: GuardianNotificationPreferenceRpcRow,
): GuardianNotificationPreference {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    emailEnabled: row.email_enabled,
    notifyPickup: row.email_pickup,
    notifyDropoff: row.email_dropoff,
    pushPickupDropoff: row.push_pickup_dropoff,
    pushTripStatus: row.push_trip_status,
    pushServiceChanges: row.push_service_changes,
    preferencesSetAt: row.preferences_set_at,
    accessExpiresAt: row.access_expires_at,
  };
}

export async function fetchGuardianNotificationPreferences(): Promise<
  GuardianNotificationPreference[]
> {
  const { data, error } = await requireSupabase().rpc('get_guardian_notification_preferences_v2');
  if (error) throw new Error('We could not load your notification choices.');
  return ((data ?? []) as GuardianNotificationPreferenceRpcRow[]).map(
    mapGuardianNotificationPreference,
  );
}

export async function saveGuardianNotificationPreference(
  input: GuardianNotificationPreferenceInput,
): Promise<void> {
  const { error } = await requireSupabase().rpc('set_guardian_notification_preferences_v2', {
    p_student_id: input.studentId,
    p_email_enabled: input.emailEnabled,
    p_email_pickup: input.emailEnabled && input.notifyPickup,
    p_email_dropoff: input.emailEnabled && input.notifyDropoff,
    p_push_pickup_dropoff: input.pushPickupDropoff,
    p_push_trip_status: input.pushTripStatus,
    p_push_service_changes: input.pushServiceChanges,
  });
  if (error) throw new Error('We could not save your notification choices. Please try again.');
}
