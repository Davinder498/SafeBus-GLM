/**
 * SafeBus Alberta — Notification helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification } from '@safebus/types';
import { toSafeBusError } from './errors.ts';

export async function getNotifications(
  supabase: SupabaseClient,
  profileId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (options?.unreadOnly) query = query.eq('status', 'unread');
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw toSafeBusError(error);
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw toSafeBusError(error);
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('status', 'unread');

  if (error) throw toSafeBusError(error);
}

export async function getUnreadCount(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('status', 'unread');

  if (error) throw toSafeBusError(error);
  return count ?? 0;
}
