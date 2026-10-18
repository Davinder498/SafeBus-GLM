// SafeBus - Phase 15B scheduled guardian notification dispatcher
//
// This is a Netlify scheduled function that invokes the same secured dispatcher
// logic as the manual POST endpoint, but without requiring a browser user or an
// external scheduler. It is the smallest reliable production-compatible invocation model for the
// existing guardian notification delivery system.
//
// Scheduling is configured in netlify.toml under:
//   [functions."guardian-notification-email-scheduled"]
//     schedule = "*/5 * * * *"
//
// Overlapping executions are safe because the database claim RPC uses
// `for update skip locked`, so two concurrent runs will never claim the
// same outbox row.
//
// Supabase and email-provider credentials remain server-only. The separate
// manual HTTP endpoint also requires SAFEBUS_NOTIFICATION_DISPATCHER_SECRET.

import { runScheduledDispatcher } from './guardian-notification-email.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function handler() {
  // Netlify scheduled invocations include a JSON body with `next_run` and do
  // not include the dispatcher's application secret. This function is marked
  // as scheduled in netlify.toml and is not addressable by URL in production,
  // so it uses the platform's invocation boundary. The separate HTTP endpoint
  // remains secret-protected and cannot request scheduled execution.

  try {
    const result = await runScheduledDispatcher();
    console.log(
      JSON.stringify({ result: 'scheduled_dispatcher_complete', statusCode: result.statusCode }),
    );
    return result;
  } catch (e) {
    console.error(JSON.stringify({ result: 'scheduled_dispatcher_error', category: 'unknown' }));
    return json(500, { error: 'Scheduled notification dispatcher failed.' });
  }
}
