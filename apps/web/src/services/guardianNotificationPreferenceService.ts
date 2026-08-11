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
  notify_pickup: boolean;
  notify_dropoff: boolean;
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
    notifyPickup: row.notify_pickup,
    notifyDropoff: row.notify_dropoff,
    preferencesSetAt: row.preferences_set_at,
    accessExpiresAt: row.access_expires_at,
  };
}

export async function fetchGuardianNotificationPreferences(): Promise<
  GuardianNotificationPreference[]
> {
  const { data, error } = await requireSupabase().rpc('get_guardian_notification_preferences');
  if (error) throw new Error('We could not load your notification choices.');
  return ((data ?? []) as GuardianNotificationPreferenceRpcRow[]).map(
    mapGuardianNotificationPreference,
  );
}

export async function saveGuardianNotificationPreference(
  input: GuardianNotificationPreferenceInput,
): Promise<void> {
  const { error } = await requireSupabase().rpc('set_guardian_notification_preferences', {
    p_student_id: input.studentId,
    p_email_enabled: input.emailEnabled,
    p_notify_pickup: input.emailEnabled && input.notifyPickup,
    p_notify_dropoff: input.emailEnabled && input.notifyDropoff,
  });
  if (error) throw new Error('We could not save your notification choices. Please try again.');
}
