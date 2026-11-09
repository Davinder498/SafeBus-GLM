import { createServerClients, json } from './billing-shared.mjs';

const ACTIONS = new Set([
  'list',
  'announcements',
  'create',
  'review',
  'release',
  'resolve_announcement',
]);
const FIELDS = new Set([
  'id',
  'tripId',
  'reason',
  'reference',
  'reviewAt',
  'minimumUntil',
  'decisionUsedAt',
  'confirm',
  'before',
  'beforeId',
]);
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  if ((event.body?.length || 0) > 4096)
    return json(400, { error: 'Invalid preservation request.' });
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid preservation request.' });
  }
  if (
    !body ||
    !ACTIONS.has(body.action) ||
    !body.data ||
    typeof body.data !== 'object' ||
    Array.isArray(body.data) ||
    Object.keys(body).some((k) => !['action', 'data'].includes(k)) ||
    Object.keys(body.data).some((k) => !FIELDS.has(k)) ||
    Object.values(body.data).some((v) => typeof v !== 'string')
  )
    return json(400, { error: 'Invalid preservation request.' });
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in required.' });
  try {
    const { user } = createServerClients(auth.slice(7));
    const identity = await user.auth.getUser();
    if (identity.error || !identity.data.user) return json(401, { error: 'Sign in required.' });
    const rate = await user.rpc('check_rate_limit', {
      p_action: 'retention_cases',
      p_actor_identifier: identity.data.user.id,
      p_max: 30,
      p_window_seconds: 60,
    });
    if (rate.error || rate.data !== true)
      return json(429, { error: 'Too many preservation requests. Try again shortly.' });
    // Uses the caller JWT, never the service client. Database enforces authority,
    // active session, privileged MFA and recent authentication for every mutation.
    const result = await user.rpc('manage_retention_case', {
      p_action: body.action,
      p_data: body.data,
    });
    if (result.error) {
      if (['PGRST202', '42883'].includes(result.error.code))
        return json(503, {
          error:
            'Records preservation is awaiting its protected database release. No preservation has been created.',
        });
      if (result.error.code === '55006')
        return json(503, {
          error: 'Preservation is busy. No change was confirmed; refresh before retrying.',
        });
      if (result.error.code === '42501')
        return json(403, {
          error:
            'School authority access and MFA are required. Sign in again before changing preservation.',
        });
      if (['22023', '22007', '22P02', '23514', '23502'].includes(result.error.code))
        return json(400, {
          error:
            'Check the reference, dates and confirmation. A minimum retention date cannot be shortened.',
        });
      return json(503, {
        error:
          'Records preservation is unavailable. No change was confirmed; refresh before retrying.',
      });
    }
    return json(200, { result: result.data });
  } catch {
    return json(503, { error: 'Records preservation is unavailable. Try again.' });
  }
}
