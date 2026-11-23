import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { installed, setup, ingest, id } from './fixtures/live-tracking-only-db.mjs';

const heartbeatSql = await fs.readFile(
  'supabase/migrations/pending/20261123095000_bounded_native_tracking_heartbeats.sql',
  'utf8',
);
const cursorSql = await fs.readFile(
  'supabase/migrations/pending/20261123113000_native_cursor_existing_row_fast_path.sql',
  'utf8',
);
const signature = 'public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)';

function percentile(input, quantile) {
  const values = [...input].sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.ceil(quantile * values.length) - 1)];
}

async function phase(db, run, device, name, start, end, timestampBase) {
  const latency = [];
  for (let sequence = start; sequence <= end; sequence++) {
    const recordedAt = new Date(timestampBase + sequence * 1000).toISOString();
    const began = performance.now();
    const ack = await ingest(
      db,
      run.trackingToken,
      device.deviceCredential,
      sequence,
      recordedAt,
      id(100 + sequence),
    );
    latency.push(performance.now() - began);
    assert.equal(ack.accepted, true, `${name}: seq ${sequence} ${ack.rejectionReason ?? ''}`);
    assert.equal(ack.duplicate, false, `${name}: unexpected duplicate seq ${sequence}`);
    assert.equal(ack.stopTracking, false);
  }
  return {
    samples: latency.length,
    meanMs: Number((latency.reduce((a, b) => a + b, 0) / latency.length).toFixed(2)),
    p50Ms: Number(percentile(latency, 0.5).toFixed(2)),
    p95Ms: Number(percentile(latency, 0.95).toFixed(2)),
  };
}

test('embedded GPS A-B-A comparison proves lost work is eliminated, without claiming 10k throughput', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const original = (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature]))
    .rows[0].definition;
  const { run, device } = await setup(db);

  // BEFORE INSERT fires even for ON CONFLICT DO NOTHING, making the
  // redundant operation count independently observable. No customer data.
  await db.exec(`
    create table public.gps_bench_insert_attempts(n int not null);
    insert into public.gps_bench_insert_attempts values(0);
    create function public.gps_bench_count_insert() returns trigger language plpgsql as $$
    begin
      update public.gps_bench_insert_attempts set n=n+1;
      return new;
    end $$;
    create trigger gps_bench_count_insert before insert
      on safebus_private.driver_tracking_state for each row
      execute function public.gps_bench_count_insert();
  `);

  const n = 16;
  const baseTime = Date.now() - 100_000;
  const attempts = async () =>
    (await db.query('select n from public.gps_bench_insert_attempts')).rows[0].n;

  const originalBefore = await phase(db, run, device, 'original-before', 1, n, baseTime);
  assert.equal(await attempts(), n, 'old path attempts an INSERT on every GPS fix');

  await db.exec(heartbeatSql);
  await db.exec(cursorSql);
  const optimized = await phase(db, run, device, 'optimized', n + 1, n * 2, baseTime);
  assert.equal(await attempts(), n, 'optimized path must never INSERT a persisted device state');

  await db.exec(original);
  const originalAfter = await phase(db, run, device, 'original-after', n * 2 + 1, n * 3, baseTime);
  assert.equal(await attempts(), n * 2, 'original INSERT attempts resume after restoring the original body');

  const finalState = (await db.query(
    'select last_sequence from safebus_private.driver_tracking_state where device_id=$1',
    [device.deviceId],
  )).rows[0];
  assert.equal(Number(finalState.last_sequence), n * 3);
  assert.equal((await db.query('select count(*)::int as n from public.driver_trip_current_locations'))
    .rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from tracking_test_signals')).rows[0].n, n * 3);

  console.log('Embedded GPS comparison (single connection, not a hosted capacity test): ' +
    JSON.stringify({ originalBefore, optimized, originalAfter, insertAttempts: {
      originalBefore: n, optimized: 0, originalAfter: n
    }}));
});
