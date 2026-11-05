import { runProductionHealth } from '../../../../scripts/lib/production-health.mjs';
import { checkMonitorCadence } from '../../../../scripts/lib/monitor-cadence.mjs';

export async function runScheduledHealth({
  deploy,
  health = runProductionHealth,
  cadence = checkMonitorCadence,
  log = console.log,
} = {}) {
  // Netlify schedules published production deploys only. Keep manual preview runs inert.
  if (!deploy || typeof deploy.context !== 'string' || typeof deploy.published !== 'boolean')
    throw new Error('MONITOR_DEPLOY_CONTEXT_MISSING');
  if (deploy.context !== 'production' || deploy.published !== true)
    return { result: 'skipped', reason: 'not_published_production' };
  // Three public health requests plus one public GitHub request: at most 24s
  // of network deadlines with the metadata check in parallel, below Netlify's 30s scheduled-function limit. No retries.
  const observations = await Promise.allSettled([
    health({ origin: 'https://safebus.kids', retries: 0, timeoutMs: 8_000 }),
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
  if (failed) throw new Error('PRODUCTION_HEALTH_OBSERVATION_FAILED');
  return { result: 'healthy' };
}

export default async function handler(_request, context) {
  await runScheduledHealth({ deploy: context?.deploy });
  return new Response(null, { status: 204 });
}
