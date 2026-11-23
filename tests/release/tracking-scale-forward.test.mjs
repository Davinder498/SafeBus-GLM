import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { independentTrackingFixture, seedSharedTrip, id } from './fixtures/independent-tracking-db.mjs';

const forward = await fs.readFile(
  'supabase/migrations/pending/20261123091500_shared_tracking_producer_coalescing.sql',
  'utf8',
);
const activation = await fs.readFile(
  'supabase/migrations/pending/20261123092000_qualified_tracking_shards.sql',
  'utf8',
);
const independent = await fs.readFile(
  'supabase/migrations/pending/20261116220000_independent_shared_tracking_workers.sql',
  'utf8',
);
const compact = await fs.readFile(
  'supabase/migrations/pending/20261120224212_compact_shared_tracking_schedule.sql',
  'utf8',
);

const scalar = async (db, sql) => (await db.query(sql)).rows[0].value;
const gps = (db) =>
  db.exec(`insert into driver_trip_current_locations values('${id(6)}','${id(1)}',1,1)
    on conflict(driver_trip_id) do update
    set latitude=driver_trip_current_locations.latitude+0.001;`);

async function prepare(t) {
  const db = await independentTrackingFixture(t);
  await db.exec(independent);
  await db.exec(`
    alter table cron.test_jobs add column active boolean not null default true;
    create or replace view cron.job as
      select name as jobname,schedule,command,active,current_user::text as username,jobid
      from cron.test_jobs;
    drop function cron.alter_job(bigint,text,boolean);
    create or replace function cron.alter_job(job_id bigint,schedule text default null,
      active boolean default null,command text default null)
    returns void language sql as $$
      update cron.test_jobs set schedule=coalesce($2,schedule),
        active=coalesce($3,active),command=coalesce($4,command) where jobid=$1 $$;
  `);
  await db.exec(compact);
  return db;
}

test('GPS produces one delayed shared marker, never personal location fan-out', async (t) => {
  const db = await prepare(t);
  await seedSharedTrip(db, 50);
  await db.exec(forward);
  await gps(db);
  await gps(db);
  assert.equal(
    await scalar(db, 'select count(*)::int as value from safebus_private.tracking_invalidation_queue'),
    0,
    'legacy guardian fan-out must not receive new GPS events',
  );
  assert.equal(
    await scalar(db, 'select count(*)::int as value from safebus_private.shared_tracking_queue'),
    1,
    'multiple fixes must share one dirty row',
  );
  assert.equal(
    await scalar(db, 'select generation as value from safebus_private.shared_tracking_queue'),
    2,
    'repeated fixes retain ACK-generation safety',
  );
  assert.equal(
    await scalar(db, 'select available_at > now() as value from safebus_private.shared_tracking_queue'),
    true,
    'new markers receive a bounded five-second coalescing window',
  );
  assert.equal(
    await scalar(db, 'select safebus_private.dispatch_compact_shared_tracking() as value'),
    0,
  );
  assert.equal(await scalar(db, 'select count(*)::int as value from realtime.messages'), 0);
  await db.exec("update safebus_private.shared_tracking_queue set available_at=now()-interval '1 second'");
  assert.equal(
    await scalar(db, 'select safebus_private.dispatch_compact_shared_tracking() as value'),
    0,
  );
  assert.equal(
    await scalar(db, 'select count(*)::int as value from safebus_private.shared_tracking_queue'),
    0,
  );
  const topics = (await db.query('select topic from realtime.messages order by topic')).rows.map(x => x.topic);
  assert.equal(topics.filter(x=>x.startsWith('safebus:bus:')).length,1);
  assert.equal(topics.filter(x=>x.startsWith('safebus:tenant:')).length,1);
  assert.equal(topics.filter(x=>x.startsWith('safebus:guardian:')).length,0);
});

test('retired direct 16-shard activation is never permitted', async (t) => {
  const db = await prepare(t);
  await assert.rejects(db.exec(activation), /Direct 16-worker activation retired/);
  assert.equal(
    await scalar(db, "select count(*)::int as value from cron.job where jobname like 'safebus-shared-tracking-%' and active"),
    1,
  );
  await db.exec("set safebus.tracking_capacity_approved = 'true'");
  await assert.rejects(db.exec(activation), /Direct 16-worker activation retired/);
  assert.equal(
    await scalar(db, "select count(*)::int as value from cron.job where jobname like 'safebus-shared-tracking-%' and active"),
    1,
  );
});
