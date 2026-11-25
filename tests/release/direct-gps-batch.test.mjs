import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {createDirectGpsLoopbackClient} from '../../scripts/lib/recovery-direct-gps-comparison.mjs';
import {installed,setup,id,time} from './fixtures/live-tracking-only-db.mjs';
import {createSupabaseClaimsVerifier,createDirectBatchWriter,createDirectGpsBatcher,createDirectGpsServer,BATCH_TRANSACTION_SETUP}
  from '../../services/tracking-ingestion/direct-batch.mjs';

const sql=await fs.readFile('services/tracking-ingestion/direct-batch.sql','utf8');
const issuer='https://synthetic.supabase.co/auth/v1';
const claims=(sub=id(3),session_id=id(70))=>({iss:issuer,aud:'authenticated',role:'authenticated',sub,session_id,aal:'aal1',exp:Math.floor(Date.now()/1000)+600});
const payload=(run,device,seq,at)=>({p_tracking_token:run.trackingToken,p_device_credential:device.deviceCredential,p_event_id:id(100+seq),p_sequence:seq,p_recorded_at:new Date(at).toISOString(),p_latitude:53.5,p_longitude:-113.5,p_accuracy_m:5,p_heading_deg:null,p_speed_mps:null,p_battery_percent:80,p_connectivity:'offline'});

test('the bounded GPS client queues on a single socket and sends no cancelled fix', { timeout: 5000 }, async t => {
  const firstArrival = Promise.withResolvers();
  const release = Promise.withResolvers();
  const arrivals = [];
  const sockets = new Set();
  const server = createServer(async (incoming, response) => {
    let body = '';
    for await (const chunk of incoming) body += chunk;
    arrivals.push(body);
    sockets.add(incoming.socket);
    if (arrivals.length === 1) {
      firstArrival.resolve();
      await release.promise;
    }
    response.end(JSON.stringify({ body }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const observed = [];
  const client = createDirectGpsLoopbackClient(server.address().port, 1, (...args) => observed.push(args));
  t.after(async () => {
    release.resolve();
    client.close();
    await new Promise(resolve => server.close(resolve));
  });
  const headers = { 'content-type': 'application/json' };
  const first = client.post(headers, '1');
  await firstArrival.promise;
  const cancel = new AbortController();
  const aborted = assert.rejects(client.post(headers, '2', cancel.signal), { name: 'AbortError' });
  const queued = client.post(headers, '3');
  cancel.abort();
  assert.deepEqual(arrivals, ['1']);
  release.resolve();
  await aborted;
  assert.deepEqual(await Promise.all([first, queued]), [
    { status: 200, body: { body: '1' } },
    { status: 200, body: { body: '3' } },
  ]);
  assert.deepEqual(arrivals, ['1', '3']);
  assert.equal(sockets.size, 1);
  assert.equal(observed.length, 2);
  assert.ok(observed.every(([name, ms]) => name === 'client_socket_wait' && ms >= 0));
});

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
    if(s===BATCH_TRANSACTION_SETUP){transactions++;return db.exec(s);}
    return db.query(s,args);
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

test('mixed batches retry a denial without duplicate writes and roll back on unexpected errors',async t=>{
  const db=await installed();t.after(()=>db.close());
  const {run,device}=await setup(db);
  await db.exec(sql);
  const record=async items=>(await db.query(
    'select safebus_private.ingest_verified_driver_location_batch($1::jsonb) as result',
    [JSON.stringify(items)],
  )).rows[0].result;
  const digest=value=>createHash('sha256').update(value).digest('hex');
  // Put the denied fix after the authorized write so a leaked write would
  // make the retry acknowledge a duplicate instead of a new position.
  const [validCredential,deniedCredential]=['a','b'].map(char=>'sbus_device_v1_'+char.repeat(43))
    .sort((a,b)=>digest(a).localeCompare(digest(b)));
  await db.query(`update public.driver_tracking_devices
    set credential_hash=safebus_private.hash_driver_device_credential($1)
    where installation_id=$2`,[validCredential,device.installationId]);
  device.deviceCredential=validCredential;
  const c=claims();
  const first={id:'first',claims:c,fix:payload(run,device,1,await time(db,'-10 seconds'))};
  const denied={id:'denied',claims:c,fix:{...first.fix,p_device_credential:deniedCredential}};
  const rejected={id:'rejected',claims:{...c,role:'anon'},fix:{...first.fix,p_device_credential:'other'}};
  const replies=new Map((await record([denied,rejected,first])).map(reply=>[reply.id,reply]));
  assert.equal(replies.get('first').status,200);
  assert.equal(replies.get('first').body.accepted,true);
  assert.equal(replies.get('first').body.duplicate,false);
  assert.equal(replies.get('denied').status,403);
  assert.equal(replies.get('rejected').status,401);
  const count=async()=>Number((await db.query('select count(*) as n from tracking_test_signals')).rows[0].n);
  assert.equal(await count(),1);

  const second={id:'second',claims:c,fix:payload(run,device,2,await time(db,'-5 seconds'))};
  const invalid={...denied,fix:{...denied.fix,p_event_id:'invalid'}};
  await assert.rejects(record([second,invalid]),{code:'22P02'});
  assert.equal(await count(),1);
  assert.equal((await record([second]))[0].body.duplicate,false);
  assert.equal(await count(),2);
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
  const seen=[],failures=[];const pool={connect:async()=>({query:async s=>{
    seen.push(s);if(s==='commit')throw Error('network failure');
    if(s.startsWith('select safebus_private'))return {rows:[{result:[{id:'x',status:200,body:{accepted:true,stopTracking:false}}]}]};
    return {rows:[]};},release:()=>{}})};
  const writer=createDirectBatchWriter({pool,observeFailure:(...failure)=>failures.push(failure)});
  await assert.rejects(writer([{id:'x'}]),/BATCH_UNAVAILABLE/);
  assert.ok(seen.includes('rollback'));
  assert.deepEqual(failures,[['commit_round_trip','unknown',1]]);
});

test('batch diagnostics record a statement timeout without exposing provider details',async()=>{
  const failures=[],commands=[],releases=[];
  const timeout=Object.assign(Error('private provider detail'),{code:'57014'});
  const writer=createDirectBatchWriter({
    pool:{connect:async()=>({
      async query(sql){
        commands.push(sql);
        if(sql.startsWith('select safebus_private'))throw timeout;
        if(sql==='rollback')throw Error('private rollback detail');
      },
      release(error){releases.push(error?.message);},
    })},
    observeFailure(...failure){
      failures.push(failure);
      throw Error('diagnostic consumer unavailable');
    },
  });

  await assert.rejects(writer([{id:'a'},{id:'b'}]),{message:'BATCH_UNAVAILABLE'});
  assert.deepEqual(failures,[['sql_round_trip','57014',2]]);
  assert.equal(commands.at(-1),'rollback');
  assert.equal(commands.includes('commit'),false);
  assert.deepEqual(releases,['CONNECTION_UNUSABLE']);
});

test('batch diagnostics distinguish connection refusal and invalid results',async()=>{
  const failures=[];
  const observeFailure=(...failure)=>failures.push(failure);
  const refused=Object.assign(Error('private provider detail'),{code:'XX000'});
  const disconnected=createDirectBatchWriter({
    pool:{async connect(){throw refused;}},observeFailure,
  });
  const incomplete=createDirectBatchWriter({
    pool:{connect:async()=>({query:async()=>({rows:[]}),release(){}})},observeFailure,
  });

  await assert.rejects(disconnected([{id:'a'}]),error=>error===refused);
  await assert.rejects(incomplete([{id:'b'}]),{message:'BATCH_UNAVAILABLE'});
  assert.deepEqual(failures,[['pool_acquire','XX000',1],['batch_response','unknown',1]]);
});

test('Recovery timing burst distinguishes gateway saturation from database writes',async()=>{
  const {directGpsPlan}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const plan=directGpsPlan(10_000);
  const gate=Promise.withResolvers();
  let committed=0;
  const batcher=createDirectGpsBatcher({batchSize:plan.batchSizes[0],maxWaitMs:plan.batchWaitMs,
    maxInFlight:plan.dbConnections,maxPending:plan.maxPending,verify:async token=>({sub:token}),
    write:async items=>{
      await gate.promise;
      committed+=items.length;
      return new Map(items.map(item=>[item.id,{status:200}]));
    }});
  const at=Date.now();
  const run={trackingToken:'sbus_track_v1_'+'a'.repeat(43)};
  const responses=Array.from({length:plan.buses},(_,index)=>{
    const device={deviceCredential:'sbus_device_v1_'+String(index).padStart(43,'0')};
    return batcher.submit('Bearer driver'+index,payload(run,device,1,at));
  });
  const expected={limit:1000,peakAdmitted:1000,rejectedAtLimit:9000};
  const beforeCommit=batcher.admissionStats();
  const committedBeforeRelease=committed;
  gate.resolve();
  const statuses=(await Promise.all(responses)).map(response=>response.status);
  batcher.close();
  assert.deepEqual(beforeCommit,expected);
  assert.equal(committedBeforeRelease,0);
  assert.equal(statuses.filter(status=>status===503).length,9000);
  assert.equal(statuses.filter(status=>status===200).length,1000);
  assert.equal(committed,1000);
  assert.deepEqual(batcher.admissionStats(),expected);
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

test('500-bus qualification compares batch sizes at eight connections within the previous workload budget',async()=>{
  const {DIRECT_GPS_SCALE_PLAN,directGpsPlan,directGpsComparisonWindows}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  assert.equal(directGpsPlan(500),DIRECT_GPS_SCALE_PLAN);
  const plan=directGpsPlan(500);
  assert.equal(plan.rounds,100);
  assert.equal(plan.dbConnections,8);
  assert.equal(plan.batchWaitMs,50);
  assert.equal(plan.p99TargetMs,1000);
  assert.equal(plan.confirmation,'RUN_RECOVERY_DIRECT_GPS_500');
  const windows=directGpsComparisonWindows(plan);
  assert.deepEqual(windows,[50,64].map(batchSize=>({batchSize,pattern:'synchronized',path:'direct_batch',
    phase:'batch_screen',writePath:'optimized',dbConnections:8,rounds:10})));
  assert.equal(windows.reduce((fixes,w)=>fixes+plan.buses*w.rounds,0),10000);
  assert.equal(plan.buses*plan.rounds*plan.patterns.length,100000);
  for(const invalid of [0,10,499,1000,5000,'500'])assert.throws(()=>directGpsPlan(invalid),/DIRECT_GPS_SCOPE/);
  assert.throws(()=>directGpsComparisonWindows({...plan,dbConnections:60}),/DIRECT_GPS_SCOPE/);
});

test('10,000-bus Recovery profile measures the burst and staggered arrivals without a p99 gate', async () => {
  const { directGpsPlan, directGpsComparisonWindows } = await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const plan = directGpsPlan(10000);
  const previous = directGpsPlan(500);
  assert.equal(plan.confirmation, 'RUN_RECOVERY_DIRECT_GPS_10000');
  assert.equal(plan.p99TargetMs, undefined);
  assert.equal(plan.screenRounds, undefined);
  assert.deepEqual(plan.batchSizes, [50]);
  assert.equal(plan.dbConnections, previous.dbConnections);
  assert.equal(plan.maxPending, previous.maxPending);
  assert.equal(plan.clientSocketLimit, 512);
  assert.equal(previous.clientSocketLimit, undefined);
  assert.equal(plan.capacityQualified, false);
  assert.deepEqual(directGpsComparisonWindows(plan), [
    { batchSize: 50, pattern: 'synchronized', path: 'direct_batch', phase: 'timing', writePath: 'optimized', dbConnections: 8, rounds: 1 },
    { batchSize: 50, pattern: 'staggered', path: 'direct_batch', phase: 'timing', writePath: 'optimized', dbConnections: 8, rounds: 10 },
  ]);
});

test('the wider screen can dispatch a synchronized burst within the same eight workers', {timeout:5000}, async t=>{
  const {directGpsPlan}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const plan=directGpsPlan(500);
  for(const batchSize of plan.batchSizes){
    const firstWave=Promise.withResolvers();
    const writers=Promise.withResolvers();
    const sizes=[];
    const batcher=createDirectGpsBatcher({
      batchSize,maxWaitMs:plan.batchWaitMs,maxInFlight:plan.dbConnections,maxPending:plan.maxPending,
      verify:async token=>({sub:token}),
      async write(items){
        sizes.push(items.length);
        if(sizes.length===plan.dbConnections) firstWave.resolve(sizes.reduce((sum,n)=>sum+n,0));
        await writers.promise;
        return new Map(items.map(item=>[item.id,{status:200}]));
      },
    });
    t.after(()=>{writers.resolve();batcher.close();});
    const time=Date.now();
    const submissions=Array.from({length:plan.buses},(_,index)=>{
      const fix=payload({trackingToken:'sbus_track_v1_'+'a'.repeat(43)},
        {deviceCredential:'sbus_device_v1_'+String(index).padStart(43,'0')},1,time);
      return batcher.submit('Bearer driver-'+index,fix);
    });
    const dispatched=await firstWave.promise;
    writers.resolve();
    assert.equal(dispatched,batchSize===50?400:500);
    assert.ok((await Promise.all(submissions)).every(result=>result.status===200));
  }
});

test('batch writer uses exactly three database commands and retains all local deadlines',async()=>{
  const calls=[],timing=[];
  const result=await createDirectBatchWriter({observe:(stage,ms,count)=>timing.push({stage,ms,count}),
    pool:{connect:async()=>({query:async(sql,args)=>{
      calls.push({sql,args});
      if(sql.startsWith('select safebus_private'))return {rows:[{result:[{id:'a',status:200,body:{accepted:true,stopTracking:false}}]}]};
      return {rows:[]};},release:()=>{}})}})([{id:'a'}]);
  assert.equal(result.get('a').status,200);
  assert.equal(calls.length,3);
  assert.equal(calls[0].sql,BATCH_TRANSACTION_SETUP);
  assert.match(calls[0].sql,/statement_timeout='2s'/);
  assert.match(calls[0].sql,/lock_timeout='250ms'/);
  assert.match(calls[0].sql,/idle_in_transaction_session_timeout='3s'/);
  assert.equal(calls[1].args[0],'[{"id":"a"}]');
  assert.equal(calls[2].sql,'commit');
  assert.deepEqual(timing.map(t=>t.stage),['pool_acquire','transaction_setup','sql_round_trip','commit_round_trip']);
  assert.ok(timing.every(t=>Number.isFinite(t.ms)&&t.ms>=0&&t.count===1));
});

test('batch screen selects the smallest passing size and requires complete evidence',async()=>{
  const {directGpsPlan,directGpsComparisonWindows,chooseDirectGpsBatchSize}=await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const plan=directGpsPlan(500);
  const windows=directGpsComparisonWindows(plan).map(w=>({...w,classification:'passed',passed:true,meetsLatencyTarget:true,batchTransactionsReconciled:true}));
  assert.equal(chooseDirectGpsBatchSize(plan,windows),50);
  windows[0].meetsLatencyTarget=false;
  assert.equal(chooseDirectGpsBatchSize(plan,windows),64);
  windows[1].meetsLatencyTarget=false;
  assert.equal(chooseDirectGpsBatchSize(plan,windows),null);
  windows[1].meetsLatencyTarget=true;
  windows[1].batchTransactionsReconciled=false;
  assert.equal(chooseDirectGpsBatchSize(plan,windows),null);
  assert.throws(()=>chooseDirectGpsBatchSize(plan,windows.slice(0,-1)),/DIRECT_GPS_SCREEN_INCOMPLETE/);
  assert.throws(()=>chooseDirectGpsBatchSize(plan,[windows[0], {...windows[1],dbConnections:12}]),/DIRECT_GPS_SCREEN_INCOMPLETE/);
  assert.throws(()=>chooseDirectGpsBatchSize(plan,[windows[0], {...windows[1],classification:'fatal'}]),/DIRECT_GPS_SCREEN_INCOMPLETE/);
});

test('Recovery worker resize stays within the session-pool budget and records an open failure', async () => {
  const { directGpsPlan, resizeDirectGpsWorkers } = await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const plan = directGpsPlan(500);
  const evidence = {};
  let activeWorkers = 4;
  let attempts = 0;
  const worker = { end: async () => { activeWorkers--; } };
  const connections = Array.from({ length: activeWorkers }, () => worker);
  const refusal = Object.assign(Error('private provider detail'), { code: 'XX000' });
  const resize = count => resizeDirectGpsWorkers({
    plan, count, evidence, connections,
    db: { query: async () => {
      assert.equal(activeWorkers, 0);
      return { rows: [{ maximum: 100, used: 12 }] };
    } },
    connect: async () => {
      attempts++;
      if (attempts === 5) throw refusal;
      activeWorkers++;
      return worker;
    },
  });

  await assert.rejects(resize(16), /DIRECT_GPS_WORKER_BOUNDS/);
  assert.equal(activeWorkers, 4);
  assert.equal(attempts, 0);
  await assert.rejects(resize(8), error => error === refusal);
  assert.equal(attempts, 5);
  assert.equal(connections.length, 4);
  assert.deepEqual(evidence, {
    workerConnectionFailure: { requestedWorkers: 8, openedWorkers: 4, sqlState: 'XX000' },
  });
  await Promise.all(connections.map(connection => connection.end()));
  assert.equal(activeWorkers, 0);
});

test('Recovery SQL snapshot returns counters or a sanitized read failure', async () => {
  const { readDirectGpsSqlCounters } = await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const snapshot = { calls: '104', total_exec_ms: 31000 };
  const db = { query: async (_sql, params) => {
    assert.deepEqual(params, ['%ingest_verified_driver_location_batch%', 'postgres']);
    return { rows: [snapshot] };
  } };
  assert.deepEqual(await readDirectGpsSqlCounters(db, true), { snapshot, failure: null });
  const failed = code => ({
    query: async () => { throw Object.assign(Error('private database detail'), { code }); },
  });
  assert.deepEqual(await readDirectGpsSqlCounters(failed('57014'), true), {
    snapshot: null, failure: { sqlState: '57014' },
  });
  assert.deepEqual(await readDirectGpsSqlCounters(failed('unexpected provider code'), true), {
    snapshot: null, failure: { sqlState: null },
  });
  assert.deepEqual(await readDirectGpsSqlCounters({ query: async () => ({ rows: [] }) }, true), {
    snapshot: null, failure: { sqlState: null },
  });
});

test('Recovery opens the window after the baseline and records completed work before stopping', async () => {
  const script = await fs.readFile('scripts/lib/recovery-direct-gps-comparison.mjs', 'utf8');
  const run = script.slice(script.indexOf('export async function runRecoveryDirectGpsComparison'));
  const baseline = run.indexOf('if(before.failure)');
  const transport = run.indexOf('const transport=window.batchSize?');
  const close = run.indexOf('await transport.close()');
  const endingSnapshot = run.indexOf('const after=await readDirectGpsSqlCounters');
  const saved = run.indexOf('evidence.windows.push(result)');
  const stop = run.indexOf("if(after.failure||sampleErrors||samples.length<2)throw Error('DIRECT_GPS_DATABASE_STATS')");
  assert.ok(baseline >= 0 && transport > baseline);
  assert.ok(close > transport && endingSnapshot > close && saved > endingSnapshot && stop > saved);
});

test('Recovery SQL window reconciles exact batch calls and preserves large counter deltas', async () => {
  const { summarizeDirectGpsSqlWindow } = await import('../../scripts/lib/recovery-direct-gps-comparison.mjs');
  const before = {
    stats_reset: '2026-11-10T13:34:48.046Z', dealloc: '0', calls: '4512', total_exec_ms: 503751,
    wal_bytes: '90071992547409930', shared_blks_hit: '16157099', shared_blks_read: '0',
  };
  const after = {
    ...before, calls: '4615', total_exec_ms: 537638, wal_bytes: '90071992562120760',
    shared_blks_hit: '17311016',
  };
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, after, 103), {
    status: 'reconciled', calls: 103, totalExecMs: 33887, meanExecMs: 329,
    walBytes: '14710830', sharedBlocksHit: '1153917', sharedBlocksRead: '0',
  });
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, after, 102), {
    status: 'call_count_mismatch', observedCalls: '103', committedTransactions: 102,
  });
  for (const counters of [{ ...after, dealloc: '1' }, { ...after, stats_reset: '2026-11-24T00:00:00Z' }]) {
    assert.deepEqual(summarizeDirectGpsSqlWindow(before, counters, 103), { status: 'counter_epoch_changed' });
  }
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, { ...after, wal_bytes: '1' }, 103), { status: 'counter_regressed' });
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, { ...after, total_exec_ms: null }, 103), { status: 'unavailable' });
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, after, 0), { status: 'unavailable' });

  const withTempBefore = { ...before, temp_blks_read: '7', temp_blks_written: '90071992547409930' };
  const withTempAfter = { ...after, temp_blks_read: '7', temp_blks_written: '90071992547409947' };
  assert.deepEqual(summarizeDirectGpsSqlWindow(withTempBefore, withTempAfter, 103), {
    ...summarizeDirectGpsSqlWindow(before, after, 103),
    tempBlocksRead: '0',
    tempBlocksWritten: '17',
  });
  assert.deepEqual(summarizeDirectGpsSqlWindow(before, withTempAfter, 103), { status: 'unavailable' });
  assert.deepEqual(summarizeDirectGpsSqlWindow(withTempBefore, { ...withTempAfter, temp_blks_read: '6' }, 103),
    { status: 'counter_regressed' });
});
