import fs from 'node:fs/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { RECOVERY_AUTH_URL } from './recovery-auth.mjs';
import { assertCapacityScope, capacityQuarantine } from './recovery-capacity-cleanup.mjs';
import { quarantineCapacity } from './recovery-capacity-lifecycle.mjs';
import { GPS_ORIGINAL_MD5, GPS_RPC_SIGNATURE, resetRecoveryGpsWindow,
  sampleRecoveryGpsDatabase, classifyRecoveryGpsStage } from './recovery-native-gps-comparison.mjs';
import { createNativeGpsTransport, createNativeGpsUpload, measureNativeGps,
  verifyNativeGpsPositions } from './recovery-native-gps-load.mjs';
import { capacityGpsLatitude } from './recovery-capacity-gps.mjs';
import { percentiles } from './recovery-capacity-scheduler.mjs';
import { createSupabaseClaimsVerifier, createDirectBatchWriter,
  createDirectGpsBatcher, createDirectGpsServer } from '../../services/tracking-ingestion/direct-batch.mjs';

const signature='safebus_private.ingest_verified_driver_location_batch(jsonb)';
export const DIRECT_GPS_PLAN=Object.freeze({
  buses:100,rounds:10,batchSizes:Object.freeze([10,25,50,100]),
  patterns:Object.freeze(['staggered','synchronized']),batchWaitMs:50,
  dbConnections:4,confirmation:'RUN_RECOVERY_DIRECT_GPS_100',
  capacityQualified:false,
});

// Only these immutable, reviewed profiles can reach the hosted test path.
export const DIRECT_GPS_SCALE_PLAN=Object.freeze({
  buses:500,rounds:100,batchSizes:Object.freeze([50]),
  patterns:DIRECT_GPS_PLAN.patterns,batchWaitMs:50,dbConnections:4,
  confirmation:'RUN_RECOVERY_DIRECT_GPS_500',capacityQualified:false,
  compareIndividual:false,p99TargetMs:1000,maxPending:1000,
  // Recovery Supavisor rejected the previous 16-worker screen at its
  // 15-client limit. Allow for control, monitor, and one spare session.
  workerCandidates:Object.freeze([4,8,12]),screenRounds:10,
});
export function directGpsPlan(buses) {
  if(buses===100)return DIRECT_GPS_PLAN;
  if(buses===500)return DIRECT_GPS_SCALE_PLAN;
  throw Error('DIRECT_GPS_SCOPE');
}

async function assertTarget(db,scope,plan) {
  assertCapacityScope(scope);
  if(scope.buses!==plan.buses||plan!==directGpsPlan(scope.buses))throw Error('DIRECT_GPS_SCOPE');
  const {rows:[r]}=await db.query(`select
    exists(select 1 from safebus_release.environment_identity where singleton
      and environment='staging'
      and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) as isolated,
    md5(replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'')) as original,
    to_regprocedure($2) is null as wrapper_absent,
    (select count(*)::int from cron.job) as jobs,
    (select count(*)::int from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$3
      and email=any($4::text[])) as owned,
    (select count(*)::int from auth.users) as total`,
    [GPS_RPC_SIGNATURE,signature,scope.run,scope.emails]);
  if(!r?.isolated||r.original!==GPS_ORIGINAL_MD5||!r.wrapper_absent||r.jobs!==0||
    r.owned!==scope.emails.length||r.total!==r.owned)throw Error('DIRECT_GPS_BASELINE');
}

// The test uses only the existing Recovery connection credential. This is
// explicitly not the production gateway role or a production provisioning path.
function boundedPool(connections) {
  const idle=[...connections];
  return {connect:async()=>{
    const client=idle.pop();
    if(!client)throw Error('DIRECT_GPS_POOL_EXHAUSTED');
    return {query:(...args)=>client.query(...args),
      release:broken=>{if(!broken)idle.push(client);}};
  }};
}

export function directGpsComparisonWindows(plan=DIRECT_GPS_PLAN) {
  if(plan!==directGpsPlan(plan.buses))throw Error('DIRECT_GPS_SCOPE');
  if(plan.workerCandidates)return plan.workerCandidates.map(dbConnections=>({
    batchSize:50,pattern:'synchronized',path:'direct_batch',phase:'worker_screen',dbConnections,rounds:plan.screenRounds,
  }));
  return [...plan.batchSizes,...(plan.compareIndividual===false?[]:[0])].flatMap(batchSize=>
    plan.patterns.map(pattern=>({batchSize,pattern,
      path:batchSize?'direct_batch':'individual_https'})));
}

export function chooseDirectGpsWorkers(plan,windows) {
  if(plan!==DIRECT_GPS_SCALE_PLAN||!Array.isArray(windows))throw Error('DIRECT_GPS_SCOPE');
  const complete=directGpsComparisonWindows(plan);
  if(windows.length!==complete.length||complete.some(c=>!windows.some(w=>
    w.phase===c.phase&&w.dbConnections===c.dbConnections&&w.rounds===c.rounds&&
    w.batchSize===c.batchSize&&w.pattern===c.pattern&&w.classification!=='fatal')))
    throw Error('DIRECT_GPS_SCREEN_INCOMPLETE');
  return plan.workerCandidates.find(n=>windows.some(w=>w.phase==='worker_screen'&&w.dbConnections===n&&
    w.passed===true&&w.meetsLatencyTarget===true&&w.batchTransactionsReconciled===true))??null;
}

function createTimingCollector(){
  const samples=new Map();
  return {
    observe(stage,ms,count=1){
      if(!Number.isFinite(ms)||ms<0||!Number.isSafeInteger(count)||count<1)return;
      const data=samples.get(stage)??{values:[],sum:0,max:0,items:0};
      data.values.push(ms);data.sum+=ms;data.max=Math.max(data.max,ms);data.items+=count;
      samples.set(stage,data);
    },
    snapshot(){return Object.fromEntries([...samples].map(([stage,d])=>[stage,{
      samples:d.values.length,items:d.items,meanMs:d.sum/d.values.length,maxMs:d.max,...percentiles(d.values),
    }]));},
  };
}

function payload(driver,sequence,recordedAt,latitude) {
  return {p_tracking_token:driver.trackingToken,p_device_credential:driver.deviceCredential,
    p_event_id:randomUUID(),p_sequence:sequence,p_recorded_at:recordedAt,
    p_latitude:latitude,p_longitude:-113.81,p_accuracy_m:5,p_heading_deg:null,
    p_speed_mps:5,p_battery_percent:80,p_connectivity:'cellular'};
}

async function directTransport({pool,auth,batchSize,signal,plan=DIRECT_GPS_PLAN,dbConnections=plan.dbConnections}) {
  const verify=createSupabaseClaimsVerifier({auth,issuer:RECOVERY_AUTH_URL+'/auth/v1'});
  const timing=createTimingCollector();
  const writer=createDirectBatchWriter({pool,observe:timing.observe});
  const metrics={transactions:0,committedTransactions:0,attemptedItems:0,
    batchSizes:{},authChecks:0,authMs:0,authMaxMs:0,writes:0,responses:0,failures:{}};
  const activeWrites=new Set();
  const batcher=createDirectGpsBatcher({batchSize,maxWaitMs:plan.batchWaitMs,
    maxInFlight:dbConnections,maxPending:plan.maxPending??500,observe:timing.observe,
    verify:async token=>{
      const start=performance.now();metrics.authChecks++;
      try{return await verify(token);}finally{
        const ms=performance.now()-start;metrics.authMs+=ms;metrics.authMaxMs=Math.max(metrics.authMaxMs,ms);
      }
    },
    write:async items=>{
      metrics.transactions++;metrics.attemptedItems+=items.length;
      metrics.batchSizes[items.length]=(metrics.batchSizes[items.length]??0)+1;
      const task=writer(items);activeWrites.add(task);
      try{const result=await task;metrics.committedTransactions++;return result;}
      finally{activeWrites.delete(task);}
    }});
  const server=createDirectGpsServer({batcher});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const endpoint='http://127.0.0.1:'+server.address().port+'/tracking/v2/location';
  const send=async(driver,fix,abortSignal)=>{
    metrics.writes++;
    try{
      const r=await fetch(endpoint,{method:'POST',redirect:'error',
        headers:{authorization:'Bearer '+driver.accessToken,'content-type':'application/json'},
        body:JSON.stringify(fix),signal:AbortSignal.any([AbortSignal.timeout(10000),...([signal,abortSignal].filter(Boolean))])});
      const body=await r.json();metrics.responses++;
      return {status:r.status,body};
    }catch{
      metrics.failures.REQUEST_FAILED=(metrics.failures.REQUEST_FAILED??0)+1;
      throw Error('DIRECT_GPS_TRANSPORT');
    }
  };
  const upload=async(driver,sequence,recordedAt,latitude,abortSignal)=>{
    const r=await send(driver,payload(driver,sequence,recordedAt,latitude),abortSignal);
    if(r.status!==200)throw Error('NATIVE_GPS_HTTP_'+r.status);
    if(r.body?.accepted!==true||r.body.duplicate!==false||r.body.stopTracking!==false||
      r.body.tripState!=='active'||Date.parse(r.body.recordedAt)!==Date.parse(recordedAt))
      throw Error('NATIVE_GPS_ACK_MISMATCH');
  };
  return {send,upload,metrics,timings:timing.snapshot,close:async()=>{
    // Stop accepting new work, then drain database transactions even when an
    // HTTP client timed out or disconnected before the write completed.
    batcher.close();await new Promise(resolve=>server.close(resolve));
    await Promise.allSettled([...activeWrites]);
  }};
}

async function sqlCounters(db,batch) {
  const {rows:[row]}=await db.query(`select
    (select stats_reset from extensions.pg_stat_statements_info)::text as stats_reset,
    (select dealloc from extensions.pg_stat_statements_info)::text as dealloc,
    coalesce(sum(calls),0)::text as calls,
    coalesce(sum(total_exec_time),0) as total_exec_ms,
    coalesce(sum(wal_bytes),0)::text as wal_bytes,
    coalesce(sum(shared_blks_hit),0)::text as shared_blks_hit,
    coalesce(sum(shared_blks_read),0)::text as shared_blks_read
    from extensions.pg_stat_statements
    where dbid=(select oid from pg_database where datname=current_database())
      and toplevel and query ilike $1
      and query not ilike '%pg_stat_statements%'
      and userid=(select oid from pg_roles where rolname=$2)`,
    [batch?'%ingest_verified_driver_location_batch%':'%ingest_driver_location_event%',batch?'postgres':'authenticated']);
  return row;
}

// The counters are cumulative. A changed epoch, eviction, or unexpected call
// count makes a window unsuitable for attributing database work to these fixes.
export function summarizeDirectGpsSqlWindow(before, after, committedTransactions) {
  const isCounter = value => typeof value === 'string' && /^\d+$/.test(value);
  if (!Number.isSafeInteger(committedTransactions) || committedTransactions < 1 ||
      ![before, after].every(snapshot => typeof snapshot?.stats_reset === 'string' &&
        snapshot.stats_reset.length > 0 && isCounter(snapshot.dealloc))) return { status: 'unavailable' };
  if (before.stats_reset !== after.stats_reset || before.dealloc !== after.dealloc)
    return { status: 'counter_epoch_changed' };

  const fields = ['calls', 'wal_bytes', 'shared_blks_hit', 'shared_blks_read'];
  const deltas = {};
  for (const field of fields) {
    if (![before[field], after[field]].every(isCounter))
      return { status: 'unavailable' };
    const delta = BigInt(after[field]) - BigInt(before[field]);
    if (delta < 0n) return { status: 'counter_regressed' };
    deltas[field] = delta.toString();
  }
  if (deltas.calls !== String(committedTransactions))
    return { status: 'call_count_mismatch', observedCalls: deltas.calls, committedTransactions };

  if (![before.total_exec_ms, after.total_exec_ms].every(value => Number.isFinite(value) && value >= 0))
    return { status: 'unavailable' };
  const totalExecMs = after.total_exec_ms - before.total_exec_ms;
  if (totalExecMs < 0) return { status: 'counter_regressed' };
  return {
    status: 'reconciled',
    calls: committedTransactions,
    totalExecMs,
    meanExecMs: totalExecMs / committedTransactions,
    walBytes: deltas.wal_bytes,
    sharedBlocksHit: deltas.shared_blks_hit,
    sharedBlocksRead: deltas.shared_blks_read,
  };
}

export async function resizeDirectGpsWorkers({ db, connections, connect, count, plan, evidence }) {
  if (plan !== directGpsPlan(plan.buses) || !(plan.workerCandidates ?? [plan.dbConnections]).includes(count)) {
    throw Error('DIRECT_GPS_WORKER_BOUNDS');
  }
  while (connections.length) {
    await connections.at(-1).end();
    connections.pop();
  }

  const { rows: [budget] } = await db.query(
    "select current_setting('max_connections')::int as maximum,(select count(*)::int from pg_stat_activity) as used",
  );
  if (!budget || budget.maximum - budget.used - count < 15) throw Error('DIRECT_GPS_CONNECTION_HEADROOM');

  while (connections.length < count) {
    try {
      connections.push(await connect('safebus-direct-gps-worker'));
    } catch (error) {
      // PostgreSQL headroom cannot account for session pooler limits. Record
      // where the refusal happened without including provider error text.
      evidence.workerConnectionFailure = {
        requestedWorkers: count,
        openedWorkers: connections.length,
        sqlState: /^[A-Z0-9]{5}$/.test(error?.code ?? '') ? error.code : null,
      };
      throw error;
    }
  }
}

export async function runRecoveryDirectGpsComparison({db,scope,drivers,evidence,connect,auth,publishableKey,signal,plan=directGpsPlan(scope.buses)}) {
  if(plan!==directGpsPlan(scope.buses)||process.env.GITHUB_REF!=='refs/heads/main'||process.env.SAFEBUS_CAPACITY_CONFIRM!==plan.confirmation||
    drivers.length!==plan.buses||new Set(drivers.map(d=>d.tripId)).size!==drivers.length)
    throw Error('DIRECT_GPS_WORKFLOW_REQUIRED');
  await assertTarget(db,scope,plan);
  const connections=[];
  let installed=false,monitor,pool;
  async function resizePool(count){
    if (connections.length === count) return;
    await resizeDirectGpsWorkers({ db, connections, connect, count, plan, evidence });
    pool=boundedPool(connections);
  }
  try{
    await quarantineCapacity(db);
    await db.query('begin');
    try{
      await db.query("set local lock_timeout='1s';set local statement_timeout='5s'");
      await db.query(await fs.readFile('services/tracking-ingestion/direct-batch.sql','utf8'));
      const {rows:[r]}=await db.query(`select
        not has_function_privilege('anon',$1,'EXECUTE') and
        not has_function_privilege('authenticated',$1,'EXECUTE') and
        not has_function_privilege('service_role',$1,'EXECUTE') as private`,[signature]);
      if(!r?.private)throw Error('DIRECT_GPS_ACL');
      await db.query('commit');installed=true;
    }catch(e){await db.query('rollback').catch(()=>{});throw e;}
    monitor=await connect('safebus-direct-gps-monitor');
    await resizePool(plan.dbConnections);
    const tripIds=drivers.map(d=>d.tripId);
    // Real hosted JWT, foreign driver, and corrupt token through actual gateway.
    const proof=await directTransport({pool,auth,batchSize:10,signal,plan});
    try{
      const fix=payload(drivers[0],1,new Date().toISOString(),capacityGpsLatitude(1));
      const denied=await proof.send({...drivers[0],accessToken:drivers[1].accessToken},fix);
      const invalid=await proof.send({...drivers[0],accessToken:'invalid.jwt.signature'},fix);
      if(denied.status!==403||invalid.status!==401)throw Error('DIRECT_GPS_SCOPE_DENIAL');
      const first=await proof.send(drivers[0],fix);
      const retry=await proof.send(drivers[0],fix);
      if(first.status!==200||first.body?.accepted!==true||first.body.duplicate!==false||
        retry.status!==200||retry.body?.accepted!==true||retry.body.duplicate!==true||
        !await verifyNativeGpsPositions(db,new Map([[drivers[0].tripId,{sequence:1,recordedAt:fix.p_recorded_at,latitude:fix.p_latitude}]])))
        throw Error('DIRECT_GPS_REPLAY_PROOF');
      evidence.securityProof={crossTenantDenied:true,invalidJwtDenied:true,committedPositionVerified:true,duplicateAcknowledged:true};
    }finally{await proof.close();}
    const windows=directGpsComparisonWindows(plan);
    let chosenWorkers=null;
    // Same credentials, schema, batch settings, and burst pattern for each
    // concurrency screen. Only the lowest passing worker count gets the soak.
    for(let wi=0;wi<windows.length;wi++){
      const window=windows[wi];
      const dbConnections=window.dbConnections??plan.dbConnections;
      await resizePool(dbConnections);
      if(signal?.aborted)throw Error('CAPACITY_STOP_REQUESTED');
      await quarantineCapacity(db);
      await resetRecoveryGpsWindow(db,scope,tripIds);
      // Direct phase keeps PostgREST quarantined. Individual phase is the
      // existing authenticated HTTPS path, with no wrapper calls.
      if(!window.batchSize){
        await db.query('grant usage on schema public,safebus_private to authenticated');
        await delay(3000,undefined,{signal});
      }
      const transport=window.batchSize?
        await directTransport({pool,auth,batchSize:window.batchSize,signal,plan,dbConnections}):createNativeGpsTransport();
      let sampleTask=null,sampleErrors=0;
      const samples=[];
      const sample=async()=>{try{samples.push(await sampleRecoveryGpsDatabase(monitor));}catch{sampleErrors++;}};
      await sample();const before=await sqlCounters(monitor,Boolean(window.batchSize));
      const timer=setInterval(()=>{if(!sampleTask)sampleTask=sample().finally(()=>{sampleTask=null;});},1000);
      const start=performance.now();
      let result;
      try{
        result=await measureNativeGps({drivers:drivers.map(d=>({...d,lastSequence:0})),rounds:window.rounds??plan.rounds,
          pattern:window.pattern,upload:window.batchSize?transport.upload:createNativeGpsUpload(publishableKey,transport.fetch),
          verifyPositions:latest=>verifyNativeGpsPositions(db,latest),signal,maxInFlight:plan.buses*2,queueBusySlots:true});
      }finally{
        clearInterval(timer);if(sampleTask)await sampleTask;
        await transport.close();
      }
      await sample();const after=await sqlCounters(monitor,Boolean(window.batchSize));
      result={...result,...window,dbConnections,elapsedMs:performance.now()-start,transport:window.batchSize?transport.metrics:transport.takeMetrics(),
        timings:window.batchSize?transport.timings():null,databaseSamples:samples,databaseSampleErrors:sampleErrors,sqlCounters:{before,after}};
      result.classification=classifyRecoveryGpsStage(result);
      result.meetsLatencyTarget=plan.p99TargetMs===undefined ? null : Number.isFinite(result.latencyMs.p99)&&result.latencyMs.p99<=plan.p99TargetMs;
      result.batchTransactionsReconciled=!window.batchSize || (transport.metrics.attemptedItems===result.offered && transport.metrics.transactions===transport.metrics.committedTransactions);
      if(!result.batchTransactionsReconciled)result.classification='fatal';
      if (window.batchSize) {
        result.sqlCounters.window = result.classification === 'fatal'
          ? { status: 'unreconciled_workload' }
          : summarizeDirectGpsSqlWindow(before, after, transport.metrics.committedTransactions);
        console.log('Direct GPS SQL counters: phase='+(window.phase??'comparison')+
          '; db_connections='+dbConnections+'; pattern='+window.pattern+
          '; window='+JSON.stringify(result.sqlCounters.window));
      }
      evidence.windows.push(result);
      console.log('Direct GPS comparison: path='+window.path+'; batch='+window.batchSize+'; pattern='+window.pattern+
        '; phase='+(window.phase??'comparison')+'; db_connections='+dbConnections+
        '; planned='+result.planned+'; sent='+result.offered+'; accepted='+result.accepted+'; late='+result.late+
        '; p99_ms='+(result.latencyMs.p99?.toFixed(1)??'unavailable')+
        '; transactions='+(window.batchSize?transport.metrics.transactions:'see_sql_counters')+
        '; batches='+(window.batchSize?JSON.stringify(transport.metrics.batchSizes):'individual')+
        '; reconciled='+result.reconciled+'; classification='+result.classification+'; latency_target_met='+result.meetsLatencyTarget+'; errors='+JSON.stringify(result.errors));
      if(result.timings)console.log('Direct GPS timing (ms): phase='+(window.phase??'comparison')+'; db_connections='+dbConnections+'; pattern='+window.pattern+'; stages='+JSON.stringify(result.timings));
      if(sampleErrors||samples.length<2)throw Error('DIRECT_GPS_DATABASE_STATS');
      // Continue only with reconciled responses; never reset ambiguous writes.
      if(result.classification==='fatal')throw Error('DIRECT_GPS_STAGE_FATAL');
      if(plan.workerCandidates&&wi===plan.workerCandidates.length-1){
        chosenWorkers=chooseDirectGpsWorkers(plan,evidence.windows);
        evidence.selectedWorkers=chosenWorkers;
        console.log('Direct GPS worker screen: selected='+(chosenWorkers??'none'));
        if(chosenWorkers===null)throw Error('DIRECT_GPS_NO_PASSING_WORKERS');
        for(const pattern of plan.patterns)windows.push({batchSize:50,pattern,path:'direct_batch',
          phase:'sustained',dbConnections:chosenWorkers,rounds:plan.rounds});
      }
    }
    evidence.completedAllWindows=evidence.windows.length===windows.length;
    const qualification=plan.workerCandidates?evidence.windows.filter(w=>w.phase==='sustained'):evidence.windows;
    evidence.passingBatchSizes=plan.batchSizes.filter(size=>
      qualification.filter(w=>w.batchSize===size&&w.passed&&w.batchTransactionsReconciled).length===2);
    if(!evidence.completedAllWindows||!evidence.passingBatchSizes.length)throw Error('DIRECT_GPS_NO_PASSING_BATCH');
    if(plan.p99TargetMs!==undefined && !qualification.every(w=>w.meetsLatencyTarget===true))
      throw Error('DIRECT_GPS_LATENCY_TARGET');
  }finally{
    for(const c of connections)await c.end().catch(()=>{});
    if(monitor)await monitor.end().catch(()=>{});
    if(installed){
      await quarantineCapacity(db);
      // Exact wrapper created by this isolated run only. Original RPC untouched.
      await db.query('drop function '+signature);
      await capacityQuarantine(db);
      const {rows:[r]}=await db.query('select to_regprocedure($1) is null as absent,md5(replace(pg_get_functiondef(to_regprocedure($2)),chr(13),\'\')) as original',[signature,GPS_RPC_SIGNATURE]);
      if(!r?.absent||r.original!==GPS_ORIGINAL_MD5)throw Error('DIRECT_GPS_RESTORE_FAILED');
      evidence.restored=true;
    }
  }
}
