import { runProductionHealth } from '../../../../scripts/lib/production-health.mjs';
import { checkMonitorCadence } from '../../../../scripts/lib/monitor-cadence.mjs';
import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';

export async function runScheduledHealth({
  deploy,
  health = runProductionHealth,
  cadence = checkMonitorCadence,
  notify = sendMonitorAlerts,
  log = console.log,
} = {}) {
  // Netlify schedules published production deploys only. Keep manual preview runs inert.
  if (!deploy || typeof deploy.context !== 'string' || typeof deploy.published !== 'boolean')
    throw new Error('MONITOR_DEPLOY_CONTEXT_MISSING');
  if (deploy.context !== 'production' || deploy.published !== true)
    return { result: 'skipped', reason: 'not_published_production' };
  // 18s health budget; GitHub's 5s check runs in parallel. Failed checks send
  // fixed operational emails in parallel with a further 5s deadline: 23s total.
  const observations = await Promise.allSettled([
    health({ origin: 'https://safebus.kids', retries: 0, timeoutMs: 6_000 }),
    cadence(),
  ]);
  const codes = observations.map((observation, i) => {
    if (observation.status === 'fulfilled')
      return { check: i === 0 ? 'public_health' : 'github_cadence', result: 'pass' };
    const message = observation.reason?.message;
    const knownCadenceErrors = new Set([
      'MONITOR_CADENCE_UNAVAILABLE',
      'MONITOR_CADENCE_INVALID_RESPONSE',
      'MONITOR_CADENCE_NO_SCHEDULED_RUN',
      'MONITOR_CADENCE_STALE',
      'MONITOR_CADENCE_NOT_SUCCESSFUL',
    ]);
    const code =
      i === 1
        ? knownCadenceErrors.has(message)
          ? message
          : 'MONITOR_CADENCE_UNAVAILABLE'
        : 'PUBLIC_HEALTH_FAILED';
    return { check: i === 0 ? 'public_health' : 'github_cadence', result: 'fail', code };
  });
  const failed = codes.some((check) => check.result === 'fail');
  // Do not log arbitrary exceptions: fetch errors or map URLs may contain keys.
  log(
    JSON.stringify({
      event: 'production_health_observation',
      result: failed ? 'failed' : 'healthy',
      checkedAt: new Date().toISOString(),
      checks: codes,
    }),
  );
  if (failed) {
    try {
      await notify({ checks: codes });
      log(JSON.stringify({ event: 'production_health_alert', result: 'provider_accepted' }));
    } catch {
      log(JSON.stringify({ event: 'production_health_alert', result: 'failed', code: 'MONITOR_ALERT_DELIVERY_FAILED' }));
    }
    // Provider acceptance must never turn a failed health observation green.
    throw new Error('PRODUCTION_HEALTH_OBSERVATION_FAILED');
  }
  return { result: 'healthy' };
}

export default async function handler(_request, context) {
  await runScheduledHealth({ deploy: context?.deploy });
  return new Response(null, { status: 204 });
}
