const RECIPIENT = 'info@safebus.kids';
const WINDOW_MS = 6 * 60 * 60 * 1_000;
const DETAILS = {
  // These templates are intentionally inert until reviewed Geoapify
  // project-wide statistics are available to a trusted operator.
  geoapify_quota_70: {
    subject: 'SafeBus alert: Geoapify project quota reached 70%',
    text: 'Verified Geoapify project-wide credit usage reached at least 70% of the current daily credit allowance. Review the Geoapify project Statistics and plan, all keys sharing the project quota, expected pilot demand and provider terms. This notice is not proof of an outage.',
  },
  geoapify_quota_90: {
    subject: 'SafeBus alert: Geoapify project quota reached 90%',
    text: 'Verified Geoapify project-wide credit usage reached at least 90% of the current daily credit allowance. Investigate project-level credit usage, competing keys, current plan and SafeBus map degradation. Do not rotate keys, buy a plan or route traffic to an unapproved provider without review.',
  },
  retention_backlog: {
    subject: 'SafeBus alert: retention disposal backlog needs attention',
    text: 'The approved retention worker completed its bounded deletion attempt but the final batch reached its per-class limit. More eligible records may remain. Inspect retention_lifecycle_completed counts, saturated state, privacy holds, backlog age and subsequent runs. Do not bypass preservation, enable additional deletions or increase limits without a reviewed change.',
  },
  retention_lifecycle: {
    subject: 'SafeBus alert: records retention needs attention',
    text: 'The scoped retention or evidence archive worker failed. Review the retention-lifecycle-scheduled function logs and the protected database release. Unverified preserved GPS must remain in the source database. This alert does not mean customer records were deleted. Retention logs: https://app.netlify.com/projects/bussafe/functions/retention-lifecycle-scheduled',
  },
  public_health: {
    subject: 'SafeBus alert: public health needs attention',
    text: 'A SafeBus public health observation failed. Review the landing page, security headers, login shell and map configuration checks. This observation alone does not establish the cause or extent of an outage.',
  },
  github_cadence: {
    subject: 'SafeBus alert: scheduled monitoring needs attention',
    text: 'The GitHub scheduled-monitor observation failed. The latest scheduled main-branch run may be missing, stale, incomplete or unsuccessful, or its public metadata could not be verified. This does not by itself mean the app is down.',
  },
};

// Fixed recipient and templates only. No student data, response bodies or secrets.
// Resend retains idempotency keys for 24h. A stable payload/key per six-hour UTC
// window and check suppresses duplicate mail across retries and cold starts.
export async function sendMonitorAlerts({
  checks,
  env = process.env,
  now = Date.now(),
  fetchImpl = fetch,
} = {}) {
  if (!Array.isArray(checks) || !Number.isFinite(now) || now < 0)
    throw new Error('MONITOR_ALERT_INVALID_INPUT');
  const failed = [
    ...new Set(checks.filter((check) => check?.result === 'fail').map((check) => check.check)),
  ];
  if (failed.some((check) => !Object.hasOwn(DETAILS, check)))
    throw new Error('MONITOR_ALERT_INVALID_INPUT');
  if (!failed.length) return { result: 'not_needed' };
  const apiKey = env.SAFEBUS_EMAIL_PROVIDER_API_KEY;
  const from = env.SAFEBUS_EMAIL_FROM;
  if (
    typeof apiKey !== 'string' ||
    !apiKey.trim() ||
    /[\r\n]/.test(apiKey) ||
    typeof from !== 'string' ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)
  )
    throw new Error('MONITOR_ALERT_CONFIGURATION_MISSING');
  const bucket = Math.floor(now / WINDOW_MS);
  const windowStart = new Date(bucket * WINDOW_MS).toISOString();
  const outcomes = await Promise.allSettled(
    failed.map(async (check) => {
      const { subject, text } = DETAILS[check];
      try {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'Idempotency-Key': `safebus-monitor-v1/${check}/${bucket}`,
          },
          body: JSON.stringify({
            from: `SafeBus operations <${from}>`,
            to: [RECIPIENT],
            subject,
            text: `${text}\n\nObservation window starts: ${windowStart}\nMonitor logs: https://app.netlify.com/projects/bussafe/functions/production-health-scheduled\nGitHub monitor: https://github.com/Davinder498/SafeBus-GLM/actions/workflows/production-health.yml\n\nRepeated failures of this check share one email per six-hour UTC window. Check the current logs before taking action. No automatic recovery email is sent.`,
          }),
        });
        if (!response.ok) throw new Error('provider_error');
        const data = await response.json();
        if (typeof data?.id !== 'string' || !data.id.trim()) throw new Error('provider_error');
      } catch {
        throw new Error('MONITOR_ALERT_DELIVERY_FAILED');
      }
    }),
  );
  if (outcomes.some((outcome) => outcome.status === 'rejected'))
    throw new Error('MONITOR_ALERT_DELIVERY_FAILED');
  // Accepted by provider, not proof of delivery to the recipient's inbox.
  return { result: 'accepted', checks: failed };
}
