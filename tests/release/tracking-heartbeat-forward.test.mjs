import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { installed, setup, ingest, time } from './fixtures/live-tracking-only-db.mjs';

const forward = await fs.readFile(
  'supabase/migrations/pending/20261123095000_bounded_native_tracking_heartbeats.sql',
  'utf8',
);

test('native GPS remains idempotent while device and session heartbeats are bounded', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  await db.exec(forward);
  const { run, device } = await setup(db);
  const first = await time(db, '-20 seconds');
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,1,first)).accepted,true);
  const sessionHash = (await db.query(
    "select session_token_hash from bus_tracking_sessions where driver_trip_id=$1", [run.trip.id]
  )).rows[0].session_token_hash;

  await db.exec("update driver_tracking_devices set last_seen_at=now()-interval '10 seconds';" +
                "update bus_tracking_sessions set last_seen_at=now()-interval '10 seconds';");
  const earlier = (await db.query(`select
    (select last_seen_at from driver_tracking_devices where id=$1) as device_seen,
    (select last_seen_at from bus_tracking_sessions where session_token_hash=$2) as session_seen`,
    [device.deviceId,sessionHash])).rows[0];
  const second = await time(db, '-10 seconds');
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,2,second)).accepted,true);
  const still = (await db.query(`select
    (select last_seen_at from driver_tracking_devices where id=$1) as device_seen,
    (select last_seen_at from bus_tracking_sessions where session_token_hash=$2) as session_seen`,
    [device.deviceId,sessionHash])).rows[0];
  assert.deepEqual(still,earlier,'current heartbeat rows should not be rewritten');
  await db.exec("update driver_tracking_devices set last_seen_at=now()-interval '31 seconds';" +
                "update bus_tracking_sessions set last_seen_at=now()-interval '31 seconds';");
  const stale = (await db.query(`select
    (select last_seen_at from driver_tracking_devices where id=$1) as device_seen,
    (select last_seen_at from bus_tracking_sessions where session_token_hash=$2) as session_seen`,
    [device.deviceId,sessionHash])).rows[0];
  const third = await time(db);
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,3,third)).accepted,true);
  const recent = (await db.query(`select
    (select last_seen_at from driver_tracking_devices where id=$1) as device_seen,
    (select last_seen_at from bus_tracking_sessions where session_token_hash=$2) as session_seen`,
    [device.deviceId,sessionHash])).rows[0];
  assert.ok(new Date(recent.device_seen)>new Date(stale.device_seen));
  assert.ok(new Date(recent.session_seen)>new Date(stale.session_seen));
  const retry = await ingest(db,run.trackingToken,device.deviceCredential,3,third);
  assert.equal(retry.duplicate,true);
  const once = (await db.query('select count(*)::integer as n from driver_trip_current_locations')).rows[0].n;
  assert.equal(once,1);
  for (const role of ['anon','service_role']) {
    const granted=(await db.query(
      "select has_function_privilege($1,'public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)','EXECUTE') as grant",
      [role]
    )).rows[0].grant;
    if (role==='anon') assert.equal(granted,false);
  }
});
