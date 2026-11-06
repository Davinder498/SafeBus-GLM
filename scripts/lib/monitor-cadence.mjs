const WORKFLOW_URL =
  'https://api.github.com/repos/Davinder498/SafeBus-GLM/actions/workflows/production-health.yml/runs?event=schedule&per_page=10';
export const MAX_MONITOR_GAP_MS = 45 * 60 * 1000;

// Public run metadata only. No GitHub token, customer rows or provider keys.
// This examines a bounded recent history (10 runs), NOT a seven-day SLA proof.
export async function checkMonitorCadence({ fetchImpl = fetch, now = Date.now() } = {}) {
  let response;
  try {
    response = await fetchImpl(WORKFLOW_URL, {
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'SafeBus-Monitor-Cadence/1.0',
      },
    });
  } catch {
    throw new Error('MONITOR_CADENCE_UNAVAILABLE');
  }
  if (!response.ok) throw new Error('MONITOR_CADENCE_UNAVAILABLE');
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('MONITOR_CADENCE_INVALID_RESPONSE');
  }
  if (!Array.isArray(data?.workflow_runs)) throw new Error('MONITOR_CADENCE_INVALID_RESPONSE');
  const scheduled = data.workflow_runs.filter(
    (run) => run?.event === 'schedule' && run.head_branch === 'main',
  );
  if (!scheduled.length) throw new Error('MONITOR_CADENCE_NO_SCHEDULED_RUN');
  // Use the most recent trigger, even if a newer failed run has an older success behind it.
  for (const run of scheduled) {
    if (
      !Number.isSafeInteger(run.id) ||
      run.id <= 0 ||
      !Number.isFinite(Date.parse(run.created_at))
    )
      throw new Error('MONITOR_CADENCE_INVALID_RESPONSE');
  }
  scheduled.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latest = scheduled[0];
  const age = now - Date.parse(latest.created_at);
  if (!Number.isFinite(now) || age < -60_000) throw new Error('MONITOR_CADENCE_INVALID_RESPONSE');
  if (age > MAX_MONITOR_GAP_MS) throw new Error('MONITOR_CADENCE_STALE');
  if (latest.status !== 'completed' || latest.conclusion !== 'success')
    throw new Error('MONITOR_CADENCE_NOT_SUCCESSFUL');
  // One recent successful run cannot establish that the scheduled checks
  // continued throughout the preceding window. Never let recovery erase
  // evidence of missed intervals or unsuccessful earlier scheduled checks.
  if (scheduled.length < 2) throw new Error('MONITOR_CADENCE_INSUFFICIENT_HISTORY');
  let maximumObservedGapMs = 0;
  for (let i = 0; i < scheduled.length - 1; i += 1) {
    const gap = Date.parse(scheduled[i].created_at) - Date.parse(scheduled[i + 1].created_at);
    if (!Number.isFinite(gap) || gap < 0) throw new Error('MONITOR_CADENCE_INVALID_RESPONSE');
    maximumObservedGapMs = Math.max(maximumObservedGapMs, gap);
    if (gap > MAX_MONITOR_GAP_MS) throw new Error('MONITOR_CADENCE_GAP');
  }
  if (scheduled.some((run) => run.status !== 'completed' || run.conclusion !== 'success'))
    throw new Error('MONITOR_CADENCE_HISTORY_NOT_SUCCESSFUL');
  return {
    result: 'healthy',
    runId: latest.id,
    lastScheduledAt: latest.created_at,
    ageMinutes: Math.max(0, Math.floor(age / 60_000)),
    maximumGapMinutes: 45,
    observedScheduledRuns: scheduled.length,
    maximumObservedGapMinutes: Math.floor(maximumObservedGapMs / 60_000),
  };
}
