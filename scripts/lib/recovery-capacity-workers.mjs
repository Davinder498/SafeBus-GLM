// Fixed, bounded plans: four shared shard groups, independent legacy and audience.
// Each dispatch retains its own transaction and database timeout. Sending all
// statements in one query removes client round trips, not server work or limits.
const clockSql = 'select extract(epoch from clock_timestamp()) * 1000 as capacity_clock_ms;';
const transaction = (body, timeout, role = '') => `begin;
set local statement_timeout='${timeout}';
set local lock_timeout='100ms';
${role}
${body}
commit;`;

export function capacityWorkerPlan(index) {
  if (!Number.isInteger(index) || index < 0 || index > 5) throw Error('CAPACITY_WORKER_PLAN');
  let statements, kind, periodMs;
  if (index < 4) {
    kind = 'shared';
    periodMs = 1000;
    statements = Array.from({ length: 4 }, (_, i) =>
      transaction(
        `select 'shared' as capacity_worker, safebus_private.dispatch_shared_tracking(${index + i * 4},256) as r;`,
        '750ms',
      ),
    );
  } else if (index === 4) {
    kind = 'legacy';
    periodMs = 1000;
    statements = [
      transaction(
        "select 'legacy' as capacity_worker, safebus_private.dispatch_tracking_invalidations(10,250) as r;",
        '750ms',
      ),
    ];
  } else {
    kind = 'audience';
    periodMs = 20000;
    statements = [
      transaction(
        "select 'audience' as capacity_worker, public.expand_notification_audiences(16) as r;",
        '8s',
        "set local request.jwt.claim.role='service_role';",
      ),
    ];
  }
  return {
    index,
    kind,
    periodMs,
    dispatches: statements.length,
    sql: [clockSql, ...statements, clockSql].join('\n'),
  };
}

export async function dispatchCapacityRound(db, plan) {
  let results;
  try {
    // No parameters: pg uses the simple protocol for the fixed multi-statement plan.
    results = await db.query(plan.sql);
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  }
  const rows = (Array.isArray(results) ? results : [results]).flatMap((r) => r.rows ?? []);
  const clocks = rows
    .filter((r) => r.capacity_clock_ms !== undefined)
    .map((r) => Number(r.capacity_clock_ms));
  const dispatches = rows.filter((r) => r.capacity_worker === plan.kind);
  if (
    clocks.length !== 2 ||
    clocks.some((n) => !Number.isFinite(n)) ||
    clocks[1] < clocks[0] ||
    dispatches.length !== plan.dispatches
  )
    throw Error('CAPACITY_WORKER_RESULT');
  if (dispatches.some((r) => r.r?.failed_scopes))
    throw Error(
      plan.kind === 'shared' ? 'CAPACITY_SHARED_WORKER_FAILED' : 'CAPACITY_LEGACY_WORKER_FAILED',
    );
  return { serverElapsedMs: clocks[1] - clocks[0], dispatches: dispatches.length };
}
