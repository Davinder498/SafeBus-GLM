import { runProductionHealth } from '../../../../scripts/lib/production-health.mjs';
import { checkMonitorCadence } from '../../../../scripts/lib/monitor-cadence.mjs';
import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';
import {
  runApplicationSignals,
  validApplicationChecks,
} from '../../../../scripts/lib/production-application-signals.mjs';

export async function runScheduledHealth({
  deploy,
  health = runProductionHealth,
  cadence = checkMonitorCadence,
  notify = sendMonitorAlerts,
  applicationSignals = runApplicationSignals,
  applicationEnabled = process.env.SAFEBUS_APPLICATION_MONITOR_ENABLED === 'true',
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
    ...(applicationEnabled ? [applicationSignals()] : []),
  ]);
  const codes = observations.slice(0, 2).map((observation, i) => {
    if (observation.status === 'fulfilled' && observation.value?.result === 'healthy')
      return { check: i === 0 ? 'public_health' : 'github_cadence', result: 'pass' };
    // A fulfilled but malformed/unhealthy return must not be counted as healthy.
    // Never trust or log provider-returned text to choose a public code.
    const message = observation.status === 'rejected' ? observation.reason?.message : null;
    const knownCadenceErrors = new Set([
      'MONITOR_CADENCE_UNAVAILABLE',
      'MONITOR_CADENCE_INVALID_RESPONSE',
      'MONITOR_CADENCE_NO_SCHEDULED_RUN',
      'MONITOR_CADENCE_STALE',
      'MONITOR_CADENCE_NOT_SUCCESSFUL',
      'MONITOR_CADENCE_INSUFFICIENT_HISTORY',
      'MONITOR_CADENCE_GAP',
      'MONITOR_CADENCE_HISTORY_NOT_SUCCESSFUL',
    ]);
    const code =
      i === 1
        ? observation.status === 'fulfilled'
          ? 'MONITOR_CADENCE_INVALID_RESPONSE'
          : knownCadenceErrors.has(message)
            ? message
            : 'MONITOR_CADENCE_UNAVAILABLE'
        : 'PUBLIC_HEALTH_FAILED';
    return { check: i === 0 ? 'public_health' : 'github_cadence', result: 'fail', code };
  });
  if (applicationEnabled) {
    const result = observations[2];
    if (result?.status === 'fulfilled' && validApplicationChecks(result.value)) {
      // The service result consists solely of reviewed fixed identifiers.
      codes.push(...result.value);
    } else {
      // Never mark a missing/malformed backend observation healthy.
      // Do not log arbitrary SDK errors or provider response text.
      codes.push(
        { check: 'app_database', result: 'fail', code: 'DATABASE_CHECK_UNAVAILABLE' },
        { check: 'app_gps_freshness', result: 'fail', code: 'GPS_CHECK_UNAVAILABLE' },
        { check: 'app_email_backlog', result: 'fail', code: 'EMAIL_QUEUE_UNAVAILABLE' },
        { check: 'app_push_backlog', result: 'fail', code: 'PUSH_QUEUE_UNAVAILABLE' },
        { check: 'app_delivery_failures', result: 'fail', code: 'DELIVERY_CHECK_UNAVAILABLE' },
        { check: 'app_map_tiles', result: 'fail', code: 'MAP_TILE_CHECK_UNAVAILABLE' },
      );
    }
  }
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
      const delivery = await notify({ checks: codes });
      if (delivery?.result !== 'accepted') throw new Error('MONITOR_ALERT_DELIVERY_FAILED');
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
