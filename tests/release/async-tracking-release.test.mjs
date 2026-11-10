import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
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
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'));
  await db.exec(`
    create function safebus_private.send_tracking_invalidation(text,text) returns void language sql as $$ select $$;
    create function safebus_private.send_guardian_tracking_invalidation(uuid,text) returns void language sql as $$ select $$;
    create function safebus_private.broadcast_route_tracking_invalidation(uuid,uuid,text) returns void language sql as $$ select $$;
    create or replace view cron.job as select name as jobname, schedule, command, true as active, current_user::text as username, jobid from cron.test_jobs;
    create function cron.unschedule(p_id bigint) returns boolean language sql as $$ delete from cron.test_jobs where jobid=p_id returning true $$;
  `);
  await db.exec(
    await fs.readFile('tests/release/fixtures/async-tracking-producer-hosted-20261110.sql', 'utf8'),
  );
  await db.exec(
    `create trigger notify_tracking_location_change after insert or update on public.driver_trip_current_locations for each row execute function safebus_private.notify_tracking_location_change();`,
  );
  return db;
}

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
