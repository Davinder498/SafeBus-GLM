import { runProductionHealth } from '../../../../scripts/lib/production-health.mjs';
import { recordMonitorHeartbeat } from '../lib/monitor-heartbeat.mjs';
import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';
import {
  runApplicationSignals,
  validApplicationChecks,
} from '../../../../scripts/lib/production-application-signals.mjs';

export async function runScheduledHealth({
  deploy,
  health = runProductionHealth,
  heartbeat = recordMonitorHeartbeat,
  notify = sendMonitorAlerts,
  applicationSignals = runApplicationSignals,
  applicationEnabled = process.env.SAFEBUS_APPLICATION_MONITOR_ENABLED === 'true',
  // Observe mode records a redacted aggregate result but cannot send new
  // application alerts or change existing public health outcomes.
  // Legacy applicationEnabled=true preserves the original alert behaviour.
  applicationMode = process.env.SAFEBUS_APPLICATION_MONITOR_MODE ?? (applicationEnabled ? 'alert' : 'off'),
  log = console.log,
} = {}) {
  // Netlify schedules published production deploys only. Keep manual preview runs inert.
  if (!deploy || typeof deploy.context !== 'string' || typeof deploy.published !== 'boolean')
    throw new Error('MONITOR_DEPLOY_CONTEXT_MISSING');
  if (deploy.context !== 'production' || deploy.published !== true)
    return { result: 'skipped', reason: 'not_published_production' };
  if (!['off', 'observe', 'alert'].includes(applicationMode))
    throw new Error('APP_MONITOR_MODE_INVALID');
  const runApplication = applicationMode !== 'off';
  // Public checks and application probes remain independent. GitHub scheduling
  // is no longer an availability dependency; UptimeRobot checks externally.
  const observations = await Promise.allSettled([
    health({ origin: 'https://safebus.kids', retries: 0, timeoutMs: 6_000 }),
    ...(runApplication ? [applicationSignals()] : []),
  ]);
  const publicHealthy = observations[0].status === 'fulfilled' &&
    observations[0].value?.result === 'healthy';
  const codes = [publicHealthy
    ? { check: 'public_health', result: 'pass' }
    : { check: 'public_health', result: 'fail', code: 'PUBLIC_HEALTH_FAILED' }];
  let applicationObservation;
  if (runApplication) {
    const result = observations[1];
    const applicationChecks =
      result?.status === 'fulfilled' && validApplicationChecks(result.value)
        ? result.value
        : [
            { check: 'app_database', result: 'fail', code: 'DATABASE_CHECK_UNAVAILABLE' },
            { check: 'app_gps_freshness', result: 'fail', code: 'GPS_CHECK_UNAVAILABLE' },
            { check: 'app_email_backlog', result: 'fail', code: 'EMAIL_QUEUE_UNAVAILABLE' },
            { check: 'app_push_backlog', result: 'fail', code: 'PUSH_QUEUE_UNAVAILABLE' },
            { check: 'app_delivery_failures', result: 'fail', code: 'DELIVERY_CHECK_UNAVAILABLE' },
            { check: 'app_map_tiles', result: 'fail', code: 'MAP_TILE_CHECK_UNAVAILABLE' },
          ];
    applicationObservation = applicationChecks.some((check) => check.result === 'fail')
      ? 'degraded'
      : 'healthy';
    if (applicationMode === 'observe') {
      // Preserve visibility into app failures without changing or emailing
      // established public-health checks.
      log(JSON.stringify({
        event: 'production_application_signals_observation',
        mode: 'observe',
        result: applicationObservation,
        checks: applicationChecks,
      }));
    } else {
      codes.push(...applicationChecks);
    }
  }
  let failed = codes.some((check) => check.result === 'fail');
  // Only the published production runner writes this minimal completion record.
  // Off/observe modes cannot make the independent monitor appear healthy.
  try {
    await heartbeat({ deploy, healthy: !failed, applicationMode });
  } catch {
    codes.push({ check: 'monitor_heartbeat', result: 'fail', code: 'MONITOR_HEARTBEAT_WRITE_FAILED' });
    failed = true;
  }
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
  return { result: 'healthy', ...(applicationMode === 'observe' ? { applicationObservation } : {}) };
}

export default async function handler(_request, context) {
  await runScheduledHealth({ deploy: context?.deploy });
  return new Response(null, { status: 204 });
}
