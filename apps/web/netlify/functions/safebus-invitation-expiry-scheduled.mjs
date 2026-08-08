// SafeBus Alberta - Phase 5 scheduled invitation expiry sweep.
//
// Netlify invokes this hourly. The database RPC atomically expires open
// invitations and disables any still-invited profile. No recipient details are
// logged or returned.

import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function runInvitationExpiry() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return json(503, { error: 'Invitation expiry runner is not configured.' });
  }

  const client = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.rpc('expire_stale_invitations');
  if (error) {
    console.error(
      JSON.stringify({ event: 'invitation_expiry_failed', code: error.code ?? 'unknown' }),
    );
    return json(500, { error: 'Invitation expiry sweep failed.' });
  }

  const expired = Number(data?.expired ?? 0);
  console.log(JSON.stringify({ event: 'invitation_expiry_completed', expired }));
  return json(200, { expired });
}

export async function handler() {
  return runInvitationExpiry();
}
