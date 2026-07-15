// SafeBus Alberta - Phase 15B scheduled guardian notification dispatcher
//
// This is a Netlify scheduled function that invokes the same secured dispatcher
// logic as the manual POST endpoint, but without requiring a browser user or an
// external scheduler. It is the smallest reliable production-compatible invocation model for the
// existing guardian notification delivery system.
//
// Scheduling is configured in netlify.toml under:
//   [functions."guardian-notification-email-scheduled"]
//     schedule = "@hourly"
//
// Overlapping executions are safe because the database claim RPC uses
// `for update skip locked`, so two concurrent runs will never claim the
// same outbox row.
//
// Server-side secrets (SUPABASE_SERVICE_ROLE_KEY,
// SAFABUS_EMAIL_PROVIDER_API_KEY, SAFABUS_NOTIFICATION_DISPATCHER_SECRET)
// are used directly here and are never exposed to the browser.
//
// The dispatcher secret is passed as an internal header so the shared
// runDispatcher() authorization check is satisfied, but the secret never
// leaves the server environment.

import { runDispatcher } from './guardian-notification-email.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function handler(event) {
  // Scheduled triggers from Netlify arrive with an empty body and no auth header.
  // Manual secure invocation is still possible via a POST that supplies the
  // x-safebus-dispatcher-secret header; in that case runDispatcher()
  // validates it normally.
  const isScheduledTrigger =
    !event?.body &&
    (event?.httpMethod === 'POST' || event?.httpMethod === 'GET' || !event?.httpMethod);

  const internalEvent = isScheduledTrigger
    ? {
        ...event,
        httpMethod: 'POST',
        headers: {
          ...(event?.headers || {}),
          'x-safebus-dispatcher-secret': process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET || '',
        },
      }
    : event;

  try {
    const result = await runDispatcher(internalEvent);
    if (isScheduledTrigger) {
      console.log(JSON.stringify({ result: 'scheduled_dispatcher_complete', statusCode: result.statusCode }));
    }
    return result;
  } catch (e) {
    console.error(JSON.stringify({ result: 'scheduled_dispatcher_error', category: 'unknown' }));
    return json(500, { error: 'Scheduled notification dispatcher failed.' });
  }
}