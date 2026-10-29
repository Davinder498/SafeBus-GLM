import { runScheduledDispatcher } from './guardian-notification-email.mjs';
import {
  authorizedCadenceStart,
  EMAIL_INTERVAL_MS,
  EMAIL_WINDOW_MS,
} from '../lib/notification-email-cadence.mjs';

// The -background suffix gives this awaited loop Netlify's background lifetime.
// This worker processes ticks zero, one and two at twenty-second intervals.
// Never use an unawaited timer: a completed serverless invocation can be frozen.
export async function handler(event) {
  const startedAt = authorizedCadenceStart(event);
  if (startedAt === null) return { statusCode: 403 };

  for (let tick = 0; tick < EMAIL_WINDOW_MS / EMAIL_INTERVAL_MS; tick++) {
    const dueAt = startedAt + tick * EMAIL_INTERVAL_MS;
    const delay = dueAt - Date.now();
    // A delayed invocation/batch skips missed slots instead of replaying a burst.
    if (delay < 0 && (tick !== 0 || delay <= -EMAIL_INTERVAL_MS)) continue;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (Date.now() >= startedAt + EMAIL_WINDOW_MS) break;
    try {
      const result = await runScheduledDispatcher();
      console.log(
        JSON.stringify({ result: 'email_cadence_tick', tick, statusCode: result.statusCode }),
      );
    } catch {
      // Retry at the next twenty-second slot; never log credentials or recipients.
      console.error(JSON.stringify({ result: 'email_cadence_tick_failed', tick }));
    }
  }
  return { statusCode: 200 };
}
