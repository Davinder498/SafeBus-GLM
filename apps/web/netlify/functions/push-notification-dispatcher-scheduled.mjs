import { runPushDispatcher } from './push-notification-dispatcher.mjs';

export async function handler(event = {}) {
  const internal = { ...event, httpMethod: 'POST', headers: { ...(event.headers || {}), 'x-safebus-push-secret': process.env.SAFEBUS_PUSH_DISPATCHER_SECRET || '' } };
  try { return await runPushDispatcher(internal); }
  catch { return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Scheduled push dispatcher failed.' }) }; }
}
