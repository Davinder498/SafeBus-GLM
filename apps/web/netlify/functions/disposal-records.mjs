import { createServerClients, json } from './billing-shared.mjs';
const ACTIONS = new Set([
  'status',
  'holds',
  'candidates',
  'preserve',
  'review',
  'release',
  'extend',
  'export',
]);
const FIELDS = new Set([
  'policy',
  'recordId',
  'id',
  'reference',
  'reviewAt',
  'minimumUntil',
  'decisionUsedAt',
  'confirm',
  'days',
  'before',
  'beforeId',
  'afterId',
]);
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body;
  try {
    if ((event.body?.length || 0) > 4096) throw new Error();
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid records request.' });
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
    return json(400, { error: 'Invalid records request.' });
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in required.' });
  try {
    const { user } = createServerClients(auth.slice(7));
    const identity = await user.auth.getUser();
    if (identity.error || !identity.data.user) return json(401, { error: 'Sign in required.' });
    const rate = await user.rpc('check_rate_limit', {
      p_action: 'disposal_records',
      p_actor_identifier: identity.data.user.id,
      p_max: 30,
      p_window_seconds: 60,
    });
    if (rate.error || rate.data !== true)
      return json(429, { error: 'Too many requests. Try again shortly.' });
    const result = await user.rpc('manage_disposal', { p_action: body.action, p_data: body.data });
    if (result.error) {
      if (result.error.code === '42501')
        return json(403, { error: 'Your access, MFA and a recent sign-in are required.' });
      if (['22023', '22007', '22P02', '23514', '23502'].includes(result.error.code))
        return json(400, { error: 'Check the record, reference, dates and confirmation.' });
      return json(503, {
        error: 'Records disposal is unavailable. No change was confirmed; refresh before retrying.',
      });
    }
    if (result.data === null || typeof result.data !== 'object')
      return json(503, { error: 'No result was confirmed. Refresh before retrying.' });
    if (
      !['status', 'holds', 'candidates', 'export'].includes(body.action) &&
      result.data.confirmed !== true
    )
      return json(503, { error: 'No change was confirmed. Refresh before retrying.' });
    return json(200, { result: result.data });
  } catch {
    return json(503, { error: 'Records disposal is unavailable. Refresh before retrying.' });
  }
}
