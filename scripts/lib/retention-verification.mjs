export const RETENTION_POLICY_KEYS = [
  'audit_records',
  'bus_run_dispatches',
  'bus_tracking_sessions',
  'driver_records',
  'guardian_relationships',
  'invitations',
  'notifications',
  'rate_limit_buckets',
  'raw_location_history',
  'student_records',
  'trip_records',
  'user_sessions',
];

/** Exercise only the installed dry-run branches, and roll back their log rows. */
export async function verifyRetentionDryRuns(client, expectedMd5) {
  if (!/^[a-f0-9]{32}$/.test(expectedMd5 ?? ''))
    throw new Error('OPERATIONAL_RETENTION_EXPECTATION');
  const runIds = [];
  const results = [];
  await client.query('begin isolation level repeatable read');
  try {
    await client.query("set local statement_timeout='15s'");
    await client.query("set local lock_timeout='1s'");
    // Normal log writers remain compatible; trigger DDL cannot race inspection.
    await client.query(
      'lock table public.retention_deletion_runs,public.audit_events in row exclusive mode',
    );
    const {
      rows: [state],
    } = await client.query(`
      select md5(replace(pg_get_functiondef(
          'safebus_private.run_retention_deletion(text,boolean)'::regprocedure),chr(13),'')) as md5,
        (select destructive_enabled from public.retention_execution_control where id=1) as destructive_enabled,
        has_function_privilege('service_role',
          'safebus_private.run_retention_deletion(text,boolean)','EXECUTE') as service_allowed,
        (select count(*)::int from pg_trigger where not tgisinternal and tgrelid in
          ('public.retention_deletion_runs'::regclass,'public.audit_events'::regclass)) as log_triggers
    `);
    if (
      state?.md5 !== expectedMd5 ||
      state.destructive_enabled !== false ||
      state.service_allowed !== true ||
      state.log_triggers !== 0
    )
      throw new Error('OPERATIONAL_RETENTION_UNSAFE_BASELINE');
    const { rows: policies } = await client.query(
      'select policy_key from public.retention_policies where active order by policy_key',
    );
    if (JSON.stringify(policies.map((p) => p.policy_key)) !== JSON.stringify(RETENTION_POLICY_KEYS))
      throw new Error('OPERATIONAL_RETENTION_POLICY_DRIFT');
    await client.query('set local role service_role');
    await client.query("set local request.jwt.claim.role='service_role'");
    for (const policy of RETENTION_POLICY_KEYS) {
      const { rows } = await client.query(
        'select run_id,policy_key,status,dry_run,error_code,affected_rows from safebus_private.run_retention_deletion($1,true)',
        [policy],
      );
      const row = rows[0];
      if (
        rows.length !== 1 ||
        !row.run_id ||
        row.policy_key !== policy ||
        row.status !== 'completed' ||
        row.dry_run !== true ||
        row.error_code !== null
      )
        throw new Error('OPERATIONAL_RETENTION_POLICY_FAILED');
      runIds.push(row.run_id);
      results.push({
        policyKey: policy,
        status: row.status,
        dryRun: true,
        eligibleRows: String(row.affected_rows),
      });
    }
  } finally {
    // Never commit verification logs, even when one policy fails.
    await client.query('rollback');
  }
  const {
    rows: [check],
  } = await client.query(
    `select
      (select count(*)::int from public.retention_deletion_runs where id=any($1::uuid[])) as retained,
      (select destructive_enabled from public.retention_execution_control where id=1) as destructive_enabled,
      md5(replace(pg_get_functiondef('safebus_private.run_retention_deletion(text,boolean)'::regprocedure),chr(13),'')) as md5`,
    [runIds],
  );
  if (check?.retained !== 0 || check.destructive_enabled !== false || check.md5 !== expectedMd5)
    throw new Error('OPERATIONAL_RETENTION_ROLLBACK_FAILED');
  return {
    policies: results,
    rollbackVerified: true,
    destructiveEnabled: false,
    deletedRows: 0,
    notificationSent: false,
  };
}

/** Capture aggregate eligibility from the installed worker without customer writes. */
export async function verifyLifecycleDryRun(client) {
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='5s'");
    await client.query("set local lock_timeout='1s'");
    const {
      rows: [control],
    } = await client.query(
      'select destructive_enabled from public.retention_execution_control where id=1',
    );
    if (control?.destructive_enabled !== false)
      throw new Error('OPERATIONAL_RETENTION_UNSAFE_BASELINE');
    await client.query('set local role service_role');
    await client.query("set local request.jwt.claim.role='service_role'");
    const {
      rows: [row],
    } = await client.query('select public.run_retention_lifecycle(true,500) result');
    const result = row?.result;
    if (
      result?.version !== 1 ||
      result.dryRun !== true ||
      result.limit !== 500 ||
      !result.counts ||
      Object.keys(result.counts).length !== 25 ||
      Object.values(result.counts).some(
        (count) => !Number.isSafeInteger(count) || count < 0 || count > 500,
      )
    ) {
      throw new Error('OPERATIONAL_RETENTION_POLICY_FAILED');
    }
    return { ...result, destructiveEnabled: false, deletedRows: 0 };
  } finally {
    await client.query('rollback');
  }
}
