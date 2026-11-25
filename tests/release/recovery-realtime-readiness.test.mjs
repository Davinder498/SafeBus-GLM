import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { inspectRecoveryRealtimePartitions } from '../../scripts/lib/recovery-realtime-readiness.mjs';

test('Recovery reports absent, stale and incomplete Realtime partition coverage', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  // Run the same catalog query used on Recovery, in READ ONLY transactions.
  async function inspect() {
    await db.exec('begin read only');
    try {
      return await inspectRecoveryRealtimePartitions(db);
    } finally {
      await db.exec('rollback');
    }
  }

  const { rows: [days] } = await db.query(`
    with utc as (select (clock_timestamp() at time zone 'UTC')::date as today)
    select (today - 1)::text as yesterday, today::text as today,
      (today + 1)::text as tomorrow, (today + 2)::text as following
    from utc
  `);
  const name = day => 'messages_' + day.replaceAll('-', '_');
  const absent = {
    utcDay: days.today, catalogPresent: false, partitionCount: 0,
    latestNamedPartition: null, todayReady: false, tomorrowReady: false,
  };
  assert.deepEqual(await inspect(), absent);

  await db.exec(`
    create schema realtime;
    create table realtime.messages (inserted_at timestamp not null)
      partition by range (inserted_at);
  `);
  assert.deepEqual(await inspect(), { ...absent, catalogPresent: true });

  await db.exec(`
    create table realtime.${name(days.yesterday)} partition of realtime.messages
      for values from ('${days.yesterday}') to ('${days.today}');
    create table realtime.messages_default partition of realtime.messages default;
  `);
  const stale = {
    ...absent, catalogPresent: true, partitionCount: 2,
    latestNamedPartition: name(days.yesterday),
  };
  assert.deepEqual(await inspect(), stale);

  await db.exec(`
    create table realtime.${name(days.today)} partition of realtime.messages
      for values from ('${days.today}') to ('${days.tomorrow}');
    create table realtime.${name(days.tomorrow)} partition of realtime.messages
      for values from ('${days.tomorrow}') to ('${days.tomorrow} 12:00:00');
  `);
  const incomplete = {
    ...stale, partitionCount: 4, latestNamedPartition: name(days.tomorrow),
    todayReady: true,
  };
  assert.deepEqual(await inspect(), incomplete);

  await db.exec(`
    drop table realtime.${name(days.tomorrow)};
    create table realtime.${name(days.tomorrow)} partition of realtime.messages
      for values from ('${days.tomorrow}') to ('${days.following}');
  `);
  assert.deepEqual(await inspect(), { ...incomplete, tomorrowReady: true });
});

test('combined workloads save failed readiness evidence before provisioning, and GPS-only skips the check', async () => {
  const script = await fs.readFile('scripts/run-recovery-capacity.mjs', 'utf8');
  const guard = script.indexOf('if (!nativeGpsOnly) {\n    const readiness');
  const save = script.indexOf('evidence.realtimePartitionReadiness = readiness;', guard);
  const abort = script.indexOf('throw Error("CAPACITY_REALTIME_PARTITION_NOT_READY");', guard);
  const setup = script.indexOf('insert into public.tenants');
  assert.ok(guard > 0 && save > guard && abort > save && setup > abort);
  assert.match(script.slice(save, abort), /!readiness\.todayReady \|\| !readiness\.tomorrowReady/);
});
