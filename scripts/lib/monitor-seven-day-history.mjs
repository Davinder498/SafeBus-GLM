// Public GitHub schedule metadata only: no account keys or customer data.
// Passing this audit cannot establish Netlify coverage or operations readiness.
const API_URL = 'https://api.github.com/repos/Davinder498/SafeBus-GLM/actions/workflows/production-health.yml/runs';
const DAY_MS = 24 * 60 * 60_000;
export const REVIEW_DAYS = 7;
export const MAX_CADENCE_GAP_MS = 45 * 60_000;
const MAX_PAGES = 10;

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value))
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10)
    ? time : null;
}

export function evaluateScheduledMonitorHistory({ runs, startAt, endAt } = {}) {
  const start = validTimestamp(startAt);
  const end = validTimestamp(endAt);
  if (!Array.isArray(runs) || start === null || end === null ||
      end - start !== REVIEW_DAYS * DAY_MS || runs.length > MAX_PAGES * 100)
    throw new Error('MONITOR_HISTORY_INVALID_INPUT');

  const scheduled = [];
  const ids = new Set();
  for (const run of runs) {
    if (run?.event !== 'schedule' || run.head_branch !== 'main') continue;
    const when = validTimestamp(run.created_at);
    if (!Number.isSafeInteger(run.id) || run.id <= 0 || when === null ||
        typeof run.status !== 'string' ||
        (run.conclusion !== null && typeof run.conclusion !== 'string') ||
        ids.has(run.id)) throw new Error('MONITOR_HISTORY_INVALID_RESPONSE');
    ids.add(run.id);
    if (when >= start && when <= end) scheduled.push({ at: when, run });
    else if (when > end + 60_000) throw new Error('MONITOR_HISTORY_INVALID_RESPONSE');
  }
  scheduled.sort((a, b) => a.at - b.at);

  let gapsOverThreshold = 0;
  let maxObservedGapMs = 0;
  let previous = start;
  for (const record of scheduled) {
    const gap = record.at - previous;
    maxObservedGapMs = Math.max(maxObservedGapMs, gap);
    if (gap > MAX_CADENCE_GAP_MS) gapsOverThreshold++;
    previous = record.at;
  }
  const finalGap = end - previous;
  maxObservedGapMs = Math.max(maxObservedGapMs, finalGap);
  if (finalGap > MAX_CADENCE_GAP_MS) gapsOverThreshold++;
  const unsuccessfulRuns = scheduled.filter(({ run }) =>
    run.status !== 'completed' || run.conclusion !== 'success').length;
  const reason = !scheduled.length ? 'MONITOR_HISTORY_NO_SCHEDULED_RUNS'
    : gapsOverThreshold > 0 ? 'MONITOR_HISTORY_GAPS'
      : unsuccessfulRuns > 0 ? 'MONITOR_HISTORY_UNSUCCESSFUL' : null;

  return {
    scope: 'github-scheduled-main-only',
    startedAt: startAt,
    endedAt: endAt,
    observedScheduledRuns: scheduled.length,
    gapsOver45Minutes: gapsOverThreshold,
    maximumObservedGapMinutes: Math.ceil(maxObservedGapMs / 60_000),
    unsuccessfulScheduledRuns: unsuccessfulRuns,
    githubCadenceResult: reason === null ? 'passed' : 'failed',
    reason,
    netlifyScheduleEvidence: 'not_checked',
    alertInboxEvidence: 'not_checked',
    operationsReadiness: 'not_approved',
  };
}

export async function collectPublicScheduledRuns({ fetchImpl = fetch, startAt } = {}) {
  const start = validTimestamp(startAt);
  if (typeof fetchImpl !== 'function' || start === null)
    throw new Error('MONITOR_HISTORY_INVALID_INPUT');
  const runs = [];
  let reachedStart = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(API_URL);
    url.searchParams.set('event', 'schedule');
    url.searchParams.set('branch', 'main');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    let response, data;
    try {
      response = await fetchImpl(url.toString(), {
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'SafeBus-ReadOnly-Seven-Day-Monitor-Audit/1.0',
        },
      });
      if (!response.ok) throw new Error('MONITOR_HISTORY_FETCH_FAILED');
      data = await response.json();
    } catch { throw new Error('MONITOR_HISTORY_FETCH_FAILED'); }
    if (!Array.isArray(data?.workflow_runs) || data.workflow_runs.length > 100)
      throw new Error('MONITOR_HISTORY_INVALID_RESPONSE');
    for (const run of data.workflow_runs) {
      if (run?.event !== 'schedule' || run.head_branch !== 'main') continue;
      const when = validTimestamp(run.created_at);
      if (when === null) throw new Error('MONITOR_HISTORY_INVALID_RESPONSE');
      runs.push(run);
      if (when < start) reachedStart = true;
    }
    if (reachedStart || data.workflow_runs.length < 100) return runs;
  }
  throw new Error('MONITOR_HISTORY_INCOMPLETE_PAGINATION');
}

export async function auditPublicMonitorHistory({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (!Number.isFinite(now) || now < REVIEW_DAYS * DAY_MS)
    throw new Error('MONITOR_HISTORY_INVALID_INPUT');
  const endAt = new Date(now).toISOString();
  const startAt = new Date(now - REVIEW_DAYS * DAY_MS).toISOString();
  const runs = await collectPublicScheduledRuns({ fetchImpl, startAt });
  return evaluateScheduledMonitorHistory({ runs, startAt, endAt });
}
