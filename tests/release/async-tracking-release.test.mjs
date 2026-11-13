import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { trackingReleaseFixture as fixture } from './fixtures/async-tracking-release-db.mjs';
import {
  operationalDigest,
  operationalSnapshot,
  verifyOperationalSnapshot,
  operationalRestoreSql,
} from '../../scripts/lib/operational-rollout.mjs';

const config = JSON.parse(
  await fs.readFile('config/pending/async-tracking-invalidations.json', 'utf8'),
);
const sql = await fs.readFile(config.migration, 'utf8');

test('reviewed async release matches observed producer, installs exact private objects and restores body, ACL and newly created cron job', async (t) => {
  assert.equal(operationalDigest(sql), config.migrationSha256);
  const db = await fixture(t);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  await db.exec('begin');
  await db.exec(sql);
  const after = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(after, config, 'after');
  const drift = structuredClone(after);
  drift.functions[0].acl.push('authenticated=X/postgres');
  assert.throws(() => verifyOperationalSnapshot(drift, config, 'after'), /FUNCTION_DRIFT/);
  await db.exec(operationalRestoreSql(before, config));
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'before');
  await db.exec('rollback');
  assert.deepEqual(await operationalSnapshot(db, config), before);
});

test('recovery refuses to discard pending refresh work', async (t) => {
  const db = await fixture(t);
  const before = await operationalSnapshot(db, config);
  await db.exec('begin');
  await db.exec(sql);
  await db.exec('commit');
  await db.exec(`insert into tenants(id) values('00000000-0000-0000-0000-000000000001');
    insert into driver_trips(id,tenant_id) values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
    insert into safebus_private.tracking_invalidation_queue(driver_trip_id,tenant_id) values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');`);
  await assert.rejects(db.exec(operationalRestoreSql(before, config)), /must drain/);
  assert.equal(
    (
      await db.query(
        'select count(*)::int as count from safebus_private.tracking_invalidation_queue',
      )
    ).rows[0].count,
    1,
  );
});

test('cron diagnostics retention is bounded and scoped to completed owned jobs older than 48 hours', async (t) => {
  const db = await fixture(t);
  await db.exec('begin');
  await db.exec(sql);
  await db.exec('commit');
  await db.exec(`insert into cron.test_jobs(name,schedule,command) values('unrelated','* * * * *','select 1');
    insert into cron.job_run_details select g,(select jobid from cron.job where jobname='safebus-tracking-invalidation-dispatcher'),now()-interval '3 days' from generate_series(1,1005) g;
    insert into cron.job_run_details values
      (2001,(select jobid from cron.job where jobname='unrelated'),now()-interval '3 days'),
      (2002,(select jobid from cron.job where jobname='safebus-tracking-invalidation-history'),null),
      (2003,(select jobid from cron.job where jobname='safebus-tracking-invalidation-dispatcher'),now());`);
  assert.equal(
    (await db.query('select safebus_private.prune_tracking_worker_history() as n')).rows[0].n,
    1000,
  );
  assert.equal(
    (await db.query('select safebus_private.prune_tracking_worker_history() as n')).rows[0].n,
    5,
  );
  assert.equal(
    (await db.query('select count(*)::int as n from cron.job_run_details')).rows[0].n,
    3,
  );
});

const cleanupConfig = JSON.parse(
  await fs.readFile('config/pending/tracking-history-cleanup.json', 'utf8'),
);
const cleanupSql = await fs.readFile(cleanupConfig.migration, 'utf8');

test('forward cleanup repair preserves worker jobs, private ACL and exact recovery', async (t) => {
  assert.equal(operationalDigest(cleanupSql), cleanupConfig.migrationSha256);
  const db = await fixture(t);
  await db.exec(sql);
  const before = await operationalSnapshot(db, cleanupConfig);
  verifyOperationalSnapshot(before, cleanupConfig, 'before');
  await db.exec('begin');
  await db.exec(cleanupSql);
  verifyOperationalSnapshot(await operationalSnapshot(db, cleanupConfig), cleanupConfig, 'after');
  await db.exec(operationalRestoreSql(before, cleanupConfig));
  assert.deepEqual(await operationalSnapshot(db, cleanupConfig), before);
  await db.exec('rollback');
});

test('cursor cleanup progresses across unrelated history, revisits late completion and bounds every batch', async (t) => {
  const db = await fixture(t);
  await db.exec(sql);
  await db.exec(cleanupSql);
  await db.exec(`insert into cron.test_jobs(name,schedule,command) values('unrelated','* * * * *','select 1');
    insert into cron.job_run_details select g,(select jobid from cron.job where jobname='unrelated'),now()-interval '4 days' from generate_series(1,3000) g;
    insert into cron.job_run_details select g,(select jobid from cron.job where jobname='safebus-tracking-invalidation-dispatcher'),now()-interval '3 days' from generate_series(4001,5200) g;
    insert into cron.job_run_details values
      (6001,(select jobid from cron.job where jobname='safebus-tracking-invalidation-history'),null),
      (6002,(select jobid from cron.job where jobname='safebus-tracking-invalidation-dispatcher'),now());`);
  const prune = async () =>
    (await db.query('select safebus_private.prune_tracking_worker_history() as n')).rows[0].n;
  const deleted = [];
  for (let i = 0; i < 5; i++) deleted.push(await prune());
  assert.deepEqual(deleted, [0, 0, 0, 1000, 200]);
  assert.equal(
    (await db.query('select count(*)::int as n from cron.job_run_details')).rows[0].n,
    3002,
  );
  // A run passed while unfinished becomes eligible in the next full sweep.
  await db.exec(
    "update cron.job_run_details set end_time=now()-interval '3 days' where runid=6001",
  );
  assert.equal(await prune(), 0);
  assert.equal(await prune(), 0);
  assert.equal(await prune(), 0);
  assert.equal(await prune(), 1);
  const plan = await db.query(`explain (format json) select runid from cron.job_run_details
    where runid > 3000 and runid <= 6002 order by runid limit 1000`);
  assert.match(JSON.stringify(plan.rows), /job_run_details_pkey/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(
      (
        await db.query(
          "select has_table_privilege($1,'safebus_private.tracking_history_cursor','SELECT,INSERT,UPDATE,DELETE') as allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
  }
});
