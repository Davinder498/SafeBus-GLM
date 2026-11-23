import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { installed,setup,ingest,time } from './fixtures/live-tracking-only-db.mjs';

const heartbeat=await fs.readFile(
  'supabase/migrations/pending/20261123095000_bounded_native_tracking_heartbeats.sql',
  'utf8'
);
const fastPath=await fs.readFile(
  'supabase/migrations/pending/20261123113000_native_cursor_existing_row_fast_path.sql',
  'utf8'
);

test('existing native GPS cursor skips speculative insert while preserving duplicate and ordering safety',async(t)=>{
  const db=await installed();
  t.after(()=>db.close());
  await db.exec(heartbeat);
  await db.exec(fastPath);

  // A BEFORE INSERT trigger proves no further insertion attempts are made
  // on the already-persisted device state, even when a new GPS arrives.
  await db.exec(`
    create table public.native_cursor_insert_attempts(n integer not null);
    insert into public.native_cursor_insert_attempts values(0);
    create function public.count_cursor_inserts() returns trigger language plpgsql as $$
    begin
      update public.native_cursor_insert_attempts set n=n+1;
      return new;
    end $$;
    create trigger count_cursor_inserts
      before insert on safebus_private.driver_tracking_state
      for each row execute function public.count_cursor_inserts();
  `);

  const {run,device}=await setup(db);
  const first=await time(db,'-10 seconds');
  const second=await time(db,'-5 seconds');
  const third=await time(db);
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,1,first)).accepted,true);
  assert.equal((await db.query('select n from native_cursor_insert_attempts')).rows[0].n,1);

  const retry=await ingest(db,run.trackingToken,device.deviceCredential,1,first);
  assert.equal(retry.accepted,true);
  assert.equal(retry.duplicate,true);
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,2,second)).accepted,true);

  const old=await ingest(db,run.trackingToken,device.deviceCredential,1,first);
  assert.equal(old.accepted,false);
  assert.equal(old.rejectionReason,'out_of_order');
  assert.equal((await ingest(db,run.trackingToken,device.deviceCredential,3,third)).accepted,true);

  const stats=(await db.query('select n from native_cursor_insert_attempts')).rows[0].n;
  assert.equal(stats,1,'only the first fix may try to insert a state row');
  const cursor=(await db.query('select last_sequence from safebus_private.driver_tracking_state')).rows[0];
  assert.equal(Number(cursor.last_sequence),3);
  assert.equal((await db.query('select count(*)::int as count from driver_trip_current_locations')).rows[0].count,1);
});

test('forward migration rejects an unexpected baseline without changing the GPS function',async(t)=>{
  const db=await installed();
  t.after(()=>db.close());
  // The prior heartbeat optimization is a required protected dependency.
  const definition=(await db.query(`
    select pg_get_functiondef('public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)'::regprocedure) as value`)).rows[0].value;
  await assert.rejects(db.exec(fastPath),/Expected GPS cursor and heartbeat baseline has changed/);
  const afterward=(await db.query(`
    select pg_get_functiondef('public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)'::regprocedure) as value`)).rows[0].value;
  assert.equal(afterward,definition);
});

test('native cursor fast path keeps all client ACLs unchanged',async(t)=>{
  const db=await installed();
  t.after(()=>db.close());
  const signature='public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)';
  const privileges=async()=>Promise.all(['anon','authenticated','service_role'].map(async(role)=>
   (await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as value',[role,signature])).rows[0].value
  ));
  const before=await privileges();
  await db.exec(heartbeat);
  await db.exec(fastPath);
  assert.deepEqual(await privileges(),before);
});
