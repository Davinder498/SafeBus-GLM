import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {once} from 'node:events';
import {installed,setup,id,time} from './fixtures/live-tracking-only-db.mjs';
import {createSupabaseClaimsVerifier,createDirectBatchWriter,createDirectGpsBatcher,createDirectGpsServer}
  from '../../services/tracking-ingestion/direct-batch.mjs';

const sql=await fs.readFile('services/tracking-ingestion/direct-batch.sql','utf8');
const issuer='https://synthetic.supabase.co/auth/v1';
const claims=(sub=id(3),session_id=id(70))=>({iss:issuer,aud:'authenticated',role:'authenticated',sub,session_id,aal:'aal1',exp:Math.floor(Date.now()/1000)+600});
const payload=(run,device,seq,at)=>({p_tracking_token:run.trackingToken,p_device_credential:device.deviceCredential,p_event_id:id(100+seq),p_sequence:seq,p_recorded_at:new Date(at).toISOString(),p_latitude:53.5,p_longitude:-113.5,p_accuracy_m:5,p_heading_deg:null,p_speed_mps:null,p_battery_percent:80,p_connectivity:'offline'});
test('HTTP to embedded PostgreSQL: commit, duplicate, denial, MFA and session revocation',async t=>{
  const db=await installed();t.after(()=>db.close());
  const {run,device}=await setup(db);
  // The fixture normally supplies fake auth GUCs. Use the real claim reading
  // contract here; the existing production-captured driver SQL is unchanged.
  await db.exec("create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;"+
    "create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb$$;");
  await db.exec(sql);
  const c=claims(),bad=claims(id(999),id(998));
  const verify=createSupabaseClaimsVerifier({issuer,auth:{getClaims:async token=>
    ({data:{claims:token==='good'?c:token==='other'?bad:null},error:null})}});
  let transactions=0;
  const pool={connect:async()=>({query:async(s,args)=>{
    if(s==='begin')transactions++;return db.query(s,args);
  },release:()=>{}})};
  const writer=createDirectBatchWriter({pool});
  const batcher=createDirectGpsBatcher({verify,write:writer,maxWaitMs:10,maxInFlight:1});
  const server=createDirectGpsServer({batcher});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{batcher.close();await new Promise(resolve=>server.close(resolve));});
  const post=async(token,fix)=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/tracking/v2/location',{
      method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(fix)});
    return {status:response.status,body:await response.json()};
  };
  const fix=payload(run,device,1,await time(db,'-10 seconds'));
  assert.equal((await post('invalid',fix)).status,401);
  assert.equal((await post('other',fix)).status,403);
  assert.equal((await post('good',fix)).body.accepted,true);
  assert.equal((await post('good',fix)).body.duplicate,true);
  assert.equal(Number((await db.query('select count(*) as n from tracking_test_signals')).rows[0].n),1);
  assert.equal((await db.query("select nullif(current_setting('request.jwt.claim.sub',true),'') as sub")).rows[0].sub,null);
  for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query("select has_function_privilege($1,'safebus_private.ingest_verified_driver_location_batch(jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  }
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[id(3)]);
  const next=payload(run,device,2,await time(db,'-5 seconds'));
  assert.equal((await post('good',next)).status,403);
  c.aal='aal2';
  assert.equal((await post('good',next)).body.accepted,true);
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[id(70)]);
  assert.equal((await post('good',payload(run,device,3,await time(db)))).status,403);
  assert.equal(Number((await db.query('select count(*) as n from tracking_test_signals')).rows[0].n),2);
  assert.ok(transactions>=6);
});
test('microbatch groups independent verified devices, returns only after writer completion',async()=>{
  const sizes=[];let release,started;
  const began=new Promise(r=>started=r);
  const gate=new Promise(r=>release=r);
  const batcher=createDirectGpsBatcher({batchSize:2,maxWaitMs:50,verify:async token=>({sub:token}),
    write:async items=>{sizes.push(items.length);started();await gate;return new Map(items.map(i=>[i.id,{status:200,body:{accepted:true}}]));}});
  const fix=n=>payload({trackingToken:'sbus_track_v1_'+'a'.repeat(43)},
    {deviceCredential:'sbus_device_v1_'+String(n).repeat(43)},n,new Date().toISOString());
  let done=false;
  const a=batcher.submit('Bearer a',fix(1)).then(r=>{done=true;return r;});
  const b=batcher.submit('Bearer b',fix(2));
  await began;assert.equal(done,false);assert.deepEqual(sizes,[2]);
  assert.equal((await batcher.submit('Bearer a',fix(1))).status,503);
  release();assert.equal((await a).status,200);assert.equal((await b).status,200);
  batcher.close();
});
test('ambiguous commit cannot return a final acknowledgement',async()=>{
  const seen=[];const pool={connect:async()=>({query:async s=>{
    seen.push(s);if(s==='commit')throw Error('network failure');
    if(s.startsWith('select safebus_private'))return {rows:[{result:[{id:'x',status:200,body:{accepted:true,stopTracking:false}}]}]};
    return {rows:[]};},release:()=>{}})};
  await assert.rejects(createDirectBatchWriter({pool})([{id:'x'}]),/BATCH_UNAVAILABLE/);
  assert.ok(seen.includes('rollback'));
});

test('hosted direct comparison is bounded and compares identical 100-bus patterns',async()=>{
  const {DIRECT_GPS_PLAN,directGpsComparisonWindows}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  assert.equal(DIRECT_GPS_PLAN.buses,100);
  assert.equal(DIRECT_GPS_PLAN.rounds,10);
  assert.equal(DIRECT_GPS_PLAN.capacityQualified,false);
  assert.deepEqual(DIRECT_GPS_PLAN.batchSizes,[10,25,50,100]);
  const windows=directGpsComparisonWindows();
  assert.equal(windows.length,10);
  assert.deepEqual(windows.slice(-2),[
    {batchSize:0,pattern:'staggered',path:'individual_https'},
    {batchSize:0,pattern:'synchronized',path:'individual_https'},
  ]);
  for(const size of DIRECT_GPS_PLAN.batchSizes)assert.deepEqual(windows.filter(w=>w.batchSize===size).map(w=>w.pattern),['staggered','synchronized']);
});

test('500-bus qualification fixes batch size 50 and keeps four DB connections, without a baseline replay',async()=>{
  const {DIRECT_GPS_SCALE_PLAN,directGpsPlan,directGpsComparisonWindows}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  assert.equal(directGpsPlan(500),DIRECT_GPS_SCALE_PLAN);
  const plan=directGpsPlan(500);
  assert.equal(plan.rounds,100);
  assert.equal(plan.dbConnections,4);
  assert.equal(plan.batchWaitMs,50);
  assert.equal(plan.p99TargetMs,1000);
  assert.equal(plan.confirmation,'RUN_RECOVERY_DIRECT_GPS_500');
  assert.deepEqual(directGpsComparisonWindows(plan),[
    {batchSize:50,pattern:'staggered',path:'direct_batch'},
    {batchSize:50,pattern:'synchronized',path:'direct_batch'},
  ]);
  assert.equal(plan.buses*plan.rounds*plan.patterns.length,100000);
  for(const invalid of [0,10,499,1000,5000,10000,'500'])assert.throws(()=>directGpsPlan(invalid),/DIRECT_GPS_SCOPE/);
  assert.throws(()=>directGpsComparisonWindows({...plan,dbConnections:60}),/DIRECT_GPS_SCOPE/);
});
