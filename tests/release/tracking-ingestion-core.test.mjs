import assert from 'node:assert/strict';
import test from 'node:test';
import {submitGpsRequests,createFifoBatchPublisher,processGpsDeliveries}
  from '../../services/tracking-ingestion/core.mjs';

import {createPgmqBatchPublisher,processPgmqShard,gpsQueueShard}
  from '../../services/tracking-ingestion/pgmq.mjs';

const now=Date.parse('2026-11-24T02:00:00.000Z');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const request=(n=1,seq=1)=>({
  authorization:'Bearer test.jwt.value',deviceCredential:'sbus_device_v1_'+'a'.repeat(43),
  trackingToken:'sbus_track_v1_'+'b'.repeat(43),
  fix:{eventId:id(100+n),sequence:seq,recordedAt:new Date(now).toISOString(),latitude:52.26,
    longitude:-113.81,accuracyM:5,headingDeg:null,speedMps:5,batteryPercent:80,connectivity:'cellular'},
});
const grant=(n=1)=>({authorized:true,role:'driver',tenantId:id(1),driverId:id(10+n),
  profileId:id(20+n),deviceId:id(30+n),tripId:id(40+n),trackingSessionId:id(50+n),
  authSessionId:id(60+n),authorizationVersion:1,expiresAt:now+30_000});
async function capture(req=request(),g=grant()) {
  let envelope;
  const result=await submitGpsRequests([req],{authorize:async()=>g,clock:()=>now,publish:async e=>{
    envelope=e[0]; return new Set([envelope.eventKey]);}});
  return {result:result[0],envelope};
}
test('durable enqueue yields only a queued receipt and never persists raw credentials',async()=>{
  const {result,envelope}=await capture();
  assert.deepEqual(result,{state:'queued',receiptId:envelope.eventKey});
  assert.equal('accepted' in result,false);
  assert.equal(envelope.scope.tenantId,id(1));
  for(const secret of ['test.jwt.value','sbus_device_v1_','sbus_track_v1_'])
    assert.equal(JSON.stringify(envelope).includes(secret),false);
});
test('malformed request, caller-supplied tenant, expired grant and wrong role fail closed',async()=>{
  let calls=0;
  const r=request();
  const bad=[{...r,tenantId:id(9)},{...r,fix:{...r.fix,latitude:91}},
    {...r,fix:{...r.fix,sequence:0}},{...r,fix:{...r.fix,recordedAt:'2020-01-01T00:00:00.000Z'}}];
  const results=await submitGpsRequests(bad,{authorize:async()=>{calls++;return grant();},
    publish:async()=>{throw Error('must not publish');},clock:()=>now});
  assert.equal(calls,0);
  assert.ok(results.every(x=>x.state==='rejected'));
  for(const g of [{...grant(),expiresAt:now},{...grant(),role:'guardian'},{...grant(),authorizationVersion:0}])
    assert.equal((await capture(r,g)).result.state,'retry');
  assert.deepEqual((await capture(r,{authorized:false})).result,{state:'rejected',code:'NOT_AUTHORIZED'});
});
test('ambiguous broker result is retryable, not GPS acceptance',async()=>{
  const r=await submitGpsRequests([request()],{authorize:async()=>grant(),
    publish:async()=>{throw Error('unavailable');},clock:()=>now});
  assert.equal(r[0].state,'retry');
});
test('retry identity is stable, conflicting payload is not suppressed and device groups are isolated',async()=>{
  const a=await capture(),b=await capture();
  assert.equal(a.envelope.eventKey,b.envelope.eventKey);
  const r=request();r.fix.latitude=52.27;
  const c=await capture(r);
  assert.equal(a.envelope.groupId,c.envelope.groupId);
  assert.notEqual(a.envelope.eventKey,c.envelope.eventKey);
  assert.notEqual(a.envelope.groupId,(await capture(request(2),grant(2))).envelope.groupId);
  assert.notEqual(a.envelope.groupId,(await capture(request(),{...grant(),tenantId:id(9)})).envelope.groupId);
});
test('partial broker batch confirmation never claims the unconfirmed event',async()=>{
  const results=await submitGpsRequests([request(),request(2)],{clock:()=>now,
    authorize:async()=>grant(1),publish:async entries=>{
      assert.equal(entries.length,1); return new Set([entries[0].eventKey]);}});
  assert.deepEqual(results.map(r=>r.state),['queued','retry']);
});
test('FIFO adapter uses Canada endpoint, device group and exact deduplication identity',async()=>{
  const a=(await capture()).envelope,b=(await capture(request(2),grant(2))).envelope;
  class Command{constructor(input){this.input=input;}}
  const client={send:async({input})=>{
    assert.equal(input.Entries.length,2);
    assert.equal(input.Entries[0].MessageGroupId,a.groupId);
    assert.equal(input.Entries[0].MessageDeduplicationId,a.eventKey);
    assert.deepEqual(JSON.parse(input.Entries[0].MessageBody),a);
    return {Successful:[{Id:'0',MessageId:'m1',SequenceNumber:'123'}],Failed:[{Id:'1'}]};
  }};
  const queueUrl='https://sqs.ca-central-1.amazonaws.com/123456789012/tracking.fifo';
  const publish=createFifoBatchPublisher({client,SendMessageBatchCommand:Command,queueUrl});
  assert.deepEqual(await publish([a,b]),new Set([a.eventKey]));
  await assert.rejects(publish([a,a]),/QUEUE_BATCH_BOUNDS/);
  assert.throws(()=>createFifoBatchPublisher({client,SendMessageBatchCommand:Command,
    queueUrl:queueUrl.replace('ca-central-1','us-east-1')}),/QUEUE_CONFIGURATION/);
});
test('consumer commits per-device sequentially and does not delete unresolved suffix',async()=>{
  const a=(await capture()).envelope;
  const b=(await capture(request(2,2))).envelope;
  const c=(await capture(request(3),grant(3))).envelope;
  const acked=[],committed=[];
  const result=await processGpsDeliveries([a,b,c].map((envelope,i)=>({envelope,receiptHandle:'h'+i})),{
    commit:async e=>{committed.push(e.eventKey);if(e===a)throw Error('timeout');
      return {eventKey:e.eventKey,durable:true,status:'committed'};},
    ack:async h=>{acked.push(h);return true;},
  });
  assert.ok(!committed.includes(b.eventKey));
  assert.deepEqual(acked,['h2']);
  assert.equal(result.deferred,2);
});
test('consumer does not delete uncommitted or mismatched receipts',async()=>{
  const {envelope}=await capture();
  for(const result of [{eventKey:envelope.eventKey,durable:false,status:'committed'},
    {eventKey:'wrong',durable:true,status:'committed'}]){
    const s=await processGpsDeliveries([{envelope,receiptHandle:'h'}],{
      commit:async()=>result,ack:async()=>{throw Error('must not acknowledge');}});
    assert.equal(s.acknowledged,0);assert.equal(s.deferred,1);
  }
});
test('consumer accepts persistent duplicate outcome but rejects tampered envelopes before writes',async()=>{
  const {envelope}=await capture();
  const summary=await processGpsDeliveries([{envelope,receiptHandle:'h'}],{
    commit:async e=>({eventKey:e.eventKey,durable:true,status:'duplicate'}),ack:async()=>true});
  assert.equal(summary.duplicate,1);assert.equal(summary.acknowledged,1);
  await assert.rejects(processGpsDeliveries([{envelope:{...envelope,scope:{...envelope.scope,tenantId:id(9)}},receiptHandle:'h'}],{
    commit:async()=>{throw Error('must not commit');},ack:async()=>true}),/INVALID_DELIVERY/);
});

function pgPool(handler) {
  const calls=[];
  return {calls,pool:{connect:async()=>({query:async(sql,args)=>{
    calls.push({sql,args}); return handler(sql,args) ?? {rows:[]};
  },release:()=>calls.push({sql:'release'})})}};
}
test('pgmq batch publisher emits receipts only after successful commit',async()=>{
  const {envelope}=await capture();
  const db=pgPool((sql,args)=>{
    if(sql.includes('pgmq.send_batch')) {
      assert.equal(args[0],'safebus_gps_v2_'+String(gpsQueueShard(envelope.groupId)).padStart(2,'0'));
      assert.deepEqual(JSON.parse(args[1][0]),envelope);
      return {rows:[{msg_id:'9223372036854775800'}]};
    }
  });
  assert.deepEqual(await createPgmqBatchPublisher({pool:db.pool})([envelope]),new Set([envelope.eventKey]));
  assert.deepEqual(db.calls.slice(-2).map(c=>c.sql),['commit','release']);
  const failure=pgPool(sql=>{if(sql==='commit')throw Error('ambiguous');if(sql.includes('pgmq.send_batch'))return {rows:[{msg_id:'1'}]};});
  await assert.rejects(createPgmqBatchPublisher({pool:failure.pool})([envelope]),/QUEUE_TRANSACTION_FAILED/);
  assert.ok(failure.calls.some(c=>c.sql==='rollback'));
});
test('pgmq shard worker commits receipts and deletes in one transaction, using a cross-worker lock',async()=>{
  const {envelope}=await capture();
  const shard=gpsQueueShard(envelope.groupId);
  const db=pgPool((sql,args)=>{
    if(sql.includes('pg_try_advisory'))return {rows:[{acquired:true}]};
    if(sql.includes('pgmq.read'))return {rows:[{msg_id:'1',message:envelope}]};
    if(sql.includes('pgmq.delete')){assert.deepEqual(args[1],['1']);return {rows:[{msg_id:'1'}]};}
  });
  const result=await processPgmqShard({pool:db.pool,shard,commitBatch:async(client,events)=>{
    assert.deepEqual(events,[envelope]);
    await client.query('test authoritative commit operation');
    return [{eventKey:envelope.eventKey,durable:true,status:'committed'}];
  }});
  assert.deepEqual(result,{state:'processed',processed:1});
  assert.ok(db.calls.findIndex(c=>c.sql.includes('test authoritative'))<db.calls.findIndex(c=>c.sql.includes('pgmq.delete')));
  assert.equal(db.calls.at(-2).sql,'commit');
});
test('pgmq refuses busy shards and rolls back any unconfirmed authoritative outcome or deletion',async()=>{
  const {envelope}=await capture();
  const shard=gpsQueueShard(envelope.groupId);
  const busy=pgPool(sql=>sql.includes('pg_try_advisory')?{rows:[{acquired:false}]}:undefined);
  assert.deepEqual(await processPgmqShard({pool:busy.pool,shard,commitBatch:async()=>{throw Error('must not run');}}),{state:'busy',processed:0});
  assert.ok(!busy.calls.some(c=>c.sql.includes('pgmq.read')));
  for(const valid of [false,true]){
    const db=pgPool(sql=>{
      if(sql.includes('pg_try_advisory'))return {rows:[{acquired:true}]};
      if(sql.includes('pgmq.read'))return {rows:[{msg_id:'1',message:envelope}]};
      if(sql.includes('pgmq.delete'))return {rows:[]};
    });
    await assert.rejects(processPgmqShard({pool:db.pool,shard,commitBatch:async()=>[{eventKey:envelope.eventKey,durable:valid,status:'committed'}]}),/QUEUE_TRANSACTION_FAILED/);
    assert.ok(db.calls.some(c=>c.sql==='rollback'));
    assert.ok(!db.calls.some(c=>c.sql==='commit'));
    assert.equal(db.calls.some(c=>c.sql.includes('pgmq.delete')),valid);
  }
});
