// Provider data adapter deliberately not implemented. Geoapify publishes
// project-wide usage in its signed-in Statistics dashboard, but we have not
// verified a supported programmatic statistics API. This is a bounded,
// operator-reviewed evaluator, not an automatic quota monitor.
const KEYS = ['source', 'scope', 'usageDate', 'usedCredits', 'limitCredits'];
const DAY_MS = 86_400_000;

export function evaluateGeoapifyQuota(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Number.isFinite(now) || now < 0 ||
      Object.keys(input).length !== KEYS.length ||
      Object.keys(input).some((key) => !KEYS.includes(key)) ||
      input.source !== 'geoapify-project-statistics' ||
      input.scope !== 'project-total' ||
      typeof input.usageDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.usageDate) ||
      typeof input.usedCredits !== 'number' ||
      !Number.isFinite(input.usedCredits) || input.usedCredits < 0 ||
      typeof input.limitCredits !== 'number' ||
      !Number.isFinite(input.limitCredits) || input.limitCredits <= 0) {
    throw new Error('MAP_QUOTA_INVALID');
  }
  // The provider dashboard supplies the usage date; assume no particular
  // reset timezone and allow the current or prior two UTC calendar dates.
  const date = Date.parse(input.usageDate + 'T00:00:00Z');
  if (!Number.isFinite(date) ||
      new Date(date).toISOString().slice(0, 10) !== input.usageDate) {
    throw new Error('MAP_QUOTA_INVALID');
  }
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z');
  if (date > today + DAY_MS || date < today - 2 * DAY_MS) {
    throw new Error('MAP_QUOTA_STALE');
  }
  const ratio = input.usedCredits / input.limitCredits;
  const level = ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'warning' : 'below_threshold';
  return {
    source: input.source,
    scope: input.scope,
    usageDate: input.usageDate,
    usedCredits: input.usedCredits,
    limitCredits: input.limitCredits,
    percentUsed: Math.round(ratio * 10_000) / 100,
    level,
    evidenceStatus: 'operator_supplied_unverified',
  };
}

export function quotaAlertChecks(assessment) {
  if (assessment?.evidenceStatus !== 'operator_supplied_unverified') {
    throw new Error('MAP_QUOTA_INVALID');
  }
  // Return only the highest alert to avoid duplicate mail. Caller must
  // validate and approve the vendor snapshot before any actual send.
  if (assessment.level === 'critical')
    return [{ check: 'geoapify_quota_90', result: 'fail' }];
  if (assessment.level === 'warning')
    return [{ check: 'geoapify_quota_70', result: 'fail' }];
  if (assessment.level === 'below_threshold') return [];
  throw new Error('MAP_QUOTA_INVALID');
}
