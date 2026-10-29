import { startEmailCadence } from '../lib/notification-email-cadence.mjs';

// Netlify cron wakes the authenticated background worker once per minute. It
// begins immediately and covers the 0/20/40-second slots without detached work.
export async function handler() {
  try {
    await startEmailCadence(Date.now());
    console.log(JSON.stringify({ result: 'scheduled_dispatcher_started' }));
    return { statusCode: 202 };
  } catch {
    console.error(JSON.stringify({ result: 'email_cadence_start_failed' }));
    return { statusCode: 500, body: JSON.stringify({ error: 'Email cadence start failed.' }) };
  }
}
