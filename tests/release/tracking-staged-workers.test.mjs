import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { independentTrackingFixture,seedSharedTrip,id } from './fixtures/independent-tracking-db.mjs';

const independent=await fs.readFile('supabase/migrations/pending/20261116220000_independent_shared_tracking_workers.sql','utf8');
const compact=await fs.readFile('supabase/migrations/pending/20261120224212_compact_shared_tracking_schedule.sql','utf8');
const stage=await fs.readFile('supabase/migrations/pending/20261123100000_staged_shared_tracking_jobs.sql','utf8');

async function fixture(t){
  const db=await independentTrackingFixture(t);
  await db.exec(independent);
  await db.exec(`
    alter table cron.test_jobs add column active boolean not null default true;
    create or replace view cron.job as
      select name as jobname,schedule,command,active,current_user::text as username,jobid
      from cron.test_jobs;
    drop function cron.alter_job(bigint,text,boolean);
    create or replace function cron.alter_job(job_id bigint,schedule text default null,
      active boolean default null,command text default null) returns void language sql as $$
      update cron.test_jobs set schedule=coalesce($2,schedule),
       active=coalesce($3,active),command=coalesce($4,command) where jobid=$1 $$;
  `);
  await db.exec(compact);
  return db;
}
const value=async(db,query)=>(await db.query(query)).rows[0].value;
const active=async(db)=>value(db,"select count(*)::int as value from cron.job where jobname like 'safebus-shared-tracking-%' and active");

test('staged tracking workers reject unapproved activation and a jump to sixteen',async(t)=>{
  const db=await fixture(t);
  await assert.rejects(db.exec(stage),/protected capacity approval/);
  assert.equal(await active(db),1);
  await db.exec("select set_config('safebus.tracking_capacity_approved','true',false)");
  await db.exec("select set_config('safebus.tracking_capacity_target','16',false)");
  await assert.rejects(db.exec(stage),/non-adjacent worker change/);
  assert.equal(await active(db),1);
});

test('progressive 1-2-4-8-16 stages preserve total shard coverage and private grants',async(t)=>{
  const db=await fixture(t);
  await db.exec("select set_config('safebus.tracking_capacity_approved','true',false)");
  for(const workers of [2,4,8,16]){
    await db.exec("select set_config('safebus.tracking_capacity_target',$1,false)".replace('$1',String(workers)));
    await db.exec(stage);
    assert.equal(await active(db),workers);
    const actual=(await db.query("select jobname,active,command from cron.job where jobname like 'safebus-shared-tracking-%' order by jobname")).rows;
    for(let i=0;i<16;i++){
      assert.equal(actual[i].active,i<workers);
      if(i<workers)assert.match(actual[i].command,new RegExp('dispatch_grouped_shared_tracking\\('+i+','+workers+'\\)'));
    }
  }
  for(const role of ['anon','authenticated','service_role']){
    assert.equal(await value(db,`select has_function_privilege('${role}',
      'safebus_private.dispatch_grouped_shared_tracking(integer,integer)','EXECUTE') as value`),false);
  }
  await db.exec("select set_config('safebus.tracking_capacity_target','8',false)");
  await assert.rejects(db.exec(stage),/protected rollback approval/);
  await db.exec("select set_config('safebus.tracking_capacity_rollback_approved','true',false)");
  for(const workers of [8,4,2,1]){
    await db.exec("select set_config('safebus.tracking_capacity_target','" + workers + "',false)");
    await db.exec(stage);
    assert.equal(await active(db),workers);
  }
  assert.match((await db.query("select command from cron.job where jobname='safebus-shared-tracking-00'")).rows[0].command,/dispatch_compact_shared_tracking/);
});

test('two workers dispatch separate shard groups without emitting personal guardian hints',async(t)=>{
  const db=await fixture(t);
  await seedSharedTrip(db,1);
  const other='f'+id(6).slice(1);
  await db.exec(`insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
    values('${other}','${id(1)}','${id(2)}','${id(3)}','${id(4)}','${id(5)}');
    insert into safebus_private.shared_tracking_queue(driver_trip_id,tenant_id)
    values('${id(6)}','${id(1)}'),('${other}','${id(1)}');`);
  await db.exec("select set_config('safebus.tracking_capacity_approved','true',false)");
  await db.exec("select set_config('safebus.tracking_capacity_target','2',false)");
  await db.exec(stage);
  assert.equal((await value(db,'select safebus_private.dispatch_grouped_shared_tracking(0,2) as value')).scopes,1);
  assert.equal((await value(db,'select safebus_private.dispatch_grouped_shared_tracking(1,2) as value')).scopes,1);
  assert.equal(await value(db,"select count(*)::int as value from safebus_private.shared_tracking_queue"),0);
  const topics=(await db.query("select topic from realtime.messages order by topic")).rows.map(r=>r.topic);
  assert.equal(topics.filter(x=>x.startsWith('safebus:bus:')).length,2);
  assert.equal(topics.filter(x=>x.startsWith('safebus:guardian:')).length,0);
});
