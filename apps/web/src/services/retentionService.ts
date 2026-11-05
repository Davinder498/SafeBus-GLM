import { supabase } from '@/lib/supabase';

export interface RetentionCase {
  id: string;
  driver_trip_id: string;
  reference: string;
  reason: string;
  window_start: string;
  window_end: string;
  minimum_until: string;
  review_at: string;
  created_at: string;
  reviewed_at: string | null;
  released_at: string | null;
  verified_chunks: number;
}
export async function retentionAction(
  action: string,
  data: Record<string, string>,
): Promise<unknown> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Sign in to manage preserved records.');
  const response = await fetch('/.netlify/functions/retention-cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, data }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Invalid preservation response.');
  if (!response.ok)
    throw new Error(
      'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Unable to manage preserved records.',
    );
  if (!('result' in body)) throw new Error('Invalid preservation response.');
  return body.result;
}
export async function listRetentionCases(data: Record<string, string>): Promise<RetentionCase[]> {
  const result = await retentionAction('list', data);
  if (
    !Array.isArray(result) ||
    !result.every((row: unknown) => {
      if (!row || typeof row !== 'object') return false;
      const r = row as Record<string, unknown>;
      return (
        [
          'id',
          'driver_trip_id',
          'reference',
          'reason',
          'window_start',
          'window_end',
          'minimum_until',
          'review_at',
          'created_at',
        ].every((key) => typeof r[key] === 'string') &&
        ['reviewed_at', 'released_at'].every(
          (key) => r[key] === null || typeof r[key] === 'string',
        ) &&
        Number.isSafeInteger(r.verified_chunks) &&
        Number(r.verified_chunks) >= 0
      );
    })
  )
    throw new Error('Invalid preservation response.');
  return result as RetentionCase[];
}
