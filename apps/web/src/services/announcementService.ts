import type {
  AnnouncementAudience,
  AnnouncementRecipientCount,
  AuthorityAnnouncement,
} from '@safebus/types';
import { supabase } from '@/lib/supabase';

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: T; error: { message: string } | null }>
  )(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export const announcementAudienceLabels: Record<AnnouncementAudience, string> = {
  all: 'All guardians and drivers',
  guardians: 'Guardians only',
  drivers: 'Drivers only',
};
export function fetchAnnouncementAudience(audience: AnnouncementAudience) {
  return rpc<AnnouncementRecipientCount>('get_announcement_audience', { p_audience: audience });
}
export function fetchAnnouncements(cursor?: AuthorityAnnouncement) {
  return rpc<AuthorityAnnouncement[]>('get_authority_announcements', {
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
  });
}
export function sendAnnouncement(value: {
  id: string;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  recipientCount: number;
}) {
  return rpc<AuthorityAnnouncement>('send_authority_announcement', {
    p_id: value.id,
    p_audience: value.audience,
    p_title: value.title,
    p_body: value.body,
    p_expected_recipient_count: value.recipientCount,
  });
}
