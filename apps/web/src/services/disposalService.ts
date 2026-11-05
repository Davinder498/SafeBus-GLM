import { supabase } from '@/lib/supabase';
export interface DisposalStatus {
  enabled: boolean;
  lastRun: string | null;
  activeHolds: number;
  reviewDue: number;
  pendingAccounts: number;
  totals: Array<{ policy_key: string; disposed: number | string }>;
  extensions: Array<{ policy: string; days: number }>;
}
export interface DisposalHold {
  id: string;
  policy_key: string;
  record_id: string;
  reference: string;
  minimum_until: string;
  review_at: string;
  released_at: string | null;
  created_at: string;
}
export interface DisposalCandidate {
  id: string;
  label: string;
  status: string | null;
}
export async function disposalAction(
  action: string,
  data: Record<string, string> = {},
): Promise<unknown> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Sign in to review records disposal.');
  const response = await fetch('/.netlify/functions/disposal-records', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, data }),
    signal: AbortSignal.timeout(15000),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('No result was confirmed. Refresh before retrying.');
  }
  if (!body || typeof body !== 'object')
    throw new Error('No result was confirmed. Refresh before retrying.');
  if (!response.ok)
    throw new Error(
      'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Records disposal is unavailable.',
    );
  if (!('result' in body) || body.result === null || typeof body.result !== 'object')
    throw new Error('Invalid records result.');
  if (
    !['status', 'holds', 'candidates', 'export'].includes(action) &&
    (!('confirmed' in body.result) || body.result.confirmed !== true)
  )
    throw new Error('No change was confirmed. Refresh before retrying.');
  return body.result;
}
export async function fetchDisposalStatus(): Promise<DisposalStatus> {
  const r = (await disposalAction('status')) as DisposalStatus;
  if (
    typeof r.enabled !== 'boolean' ||
    !(r.lastRun === null || typeof r.lastRun === 'string') ||
    !Number.isSafeInteger(r.activeHolds) ||
    !Number.isSafeInteger(r.reviewDue) ||
    !Number.isSafeInteger(r.pendingAccounts) ||
    !Array.isArray(r.totals) ||
    !r.totals.every((t) => typeof t.policy_key === 'string' && /^\d+$/.test(String(t.disposed))) ||
    !Array.isArray(r.extensions) ||
    !r.extensions.every((e) => typeof e.policy === 'string' && Number.isSafeInteger(e.days))
  )
    throw new Error('Invalid disposal status.');
  return r;
}
export async function fetchDisposalHolds(
  data: Record<string, string> = {},
): Promise<DisposalHold[]> {
  const r = await disposalAction('holds', data);
  if (
    !Array.isArray(r) ||
    !r.every(
      (h) =>
        h &&
        [
          'id',
          'policy_key',
          'record_id',
          'reference',
          'minimum_until',
          'review_at',
          'created_at',
        ].every((k) => typeof h[k] === 'string') &&
        (h.released_at === null || typeof h.released_at === 'string'),
    )
  )
    throw new Error('Invalid preservation list.');
  return r;
}
export async function fetchDisposalCandidates(
  policy: string,
  afterId?: string,
): Promise<DisposalCandidate[]> {
  const r = await disposalAction('candidates', { policy, ...(afterId ? { afterId } : {}) });
  if (
    !Array.isArray(r) ||
    !r.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.label === 'string' &&
        (c.status === null || typeof c.status === 'string'),
    )
  )
    throw new Error('Invalid record list.');
  return r;
}
