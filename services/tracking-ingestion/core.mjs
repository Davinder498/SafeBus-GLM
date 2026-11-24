import { createHash } from 'node:crypto';

// Version 2 is intentionally not the current Android acknowledgement contract.
// This module has no HTTP listener, credentials, database or cloud side effects.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^sbus_track_v1_[A-Za-z0-9_-]{40,80}$/;
const DEVICE = /^sbus_device_v1_[A-Za-z0-9_-]{40,80}$/;
const HASH = /^[0-9a-f]{64}$/;
const FIELDS = ['eventId','sequence','recordedAt','latitude','longitude','accuracyM',
  'headingDeg','speedMps','batteryPercent','connectivity'];
const SCOPE = ['tenantId','driverId','profileId','deviceId','tripId','trackingSessionId','authSessionId'];
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_FUTURE = 2 * 60 * 1000;
const hash = x => createHash('sha256').update(x).digest('hex');
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v,k));
const uuid = v => typeof v === 'string' && UUID.test(v);
const num = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const nullable = (v,min,max) => v === null || num(v,min,max);
const reject = code => Object.freeze({state:'rejected',code});
const retry = () => Object.freeze({state:'retry',code:'TEMPORARILY_UNAVAILABLE'});

function normalizeFix(fix, now) {
  if (!exact(fix,FIELDS) || !uuid(fix.eventId) ||
      !Number.isSafeInteger(fix.sequence) || fix.sequence < 1 ||
      typeof fix.recordedAt !== 'string' || fix.recordedAt.length !== 24 ||
      !num(fix.latitude,-90,90) || !num(fix.longitude,-180,180) ||
      !nullable(fix.accuracyM,0,10000) || !nullable(fix.headingDeg,0,360) ||
      !nullable(fix.speedMps,0,150) ||
      (fix.batteryPercent !== null && (!Number.isInteger(fix.batteryPercent) || !num(fix.batteryPercent,0,100))) ||
      ![null,'cellular','wifi','offline','unknown'].includes(fix.connectivity)) return null;
  const at = Date.parse(fix.recordedAt);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== fix.recordedAt ||
      at < now-MAX_AGE || at > now+MAX_FUTURE) return null;
  return Object.fromEntries(FIELDS.map(k => [k,fix[k]]));
}

function keys(scope, fix) {
  // Device cursor is authoritative across tracking sessions, so preserve device order.
  const groupId = hash(JSON.stringify([scope.tenantId,scope.deviceId]));
  // Conflicting content must not be silently suppressed by broker deduplication.
  // A persistent authoritative cursor/receipt still rejects conflicting identities.
  const eventKey = hash(JSON.stringify([scope.tenantId,scope.deviceId,scope.tripId,
    scope.trackingSessionId,fix]));
  return {groupId,eventKey};
}

function validateGrant(grant, now) {
  return grant && grant.authorized === true && grant.role === 'driver' &&
    SCOPE.every(k => uuid(grant[k])) && Number.isSafeInteger(grant.authorizationVersion) &&
    grant.authorizationVersion >= 1 && Number.isSafeInteger(grant.expiresAt) &&
    grant.expiresAt > now && grant.expiresAt <= now + 60_000;
}

export function validEnvelope(envelope) {
  if (!exact(envelope,['version','scope','fix','groupId','eventKey']) || envelope.version !== 2 ||
      !exact(envelope.scope,[...SCOPE,'authorizationVersion']) ||
      !SCOPE.every(k => uuid(envelope.scope[k])) ||
      !Number.isSafeInteger(envelope.scope.authorizationVersion) || envelope.scope.authorizationVersion < 1 ||
      !exact(envelope.fix,FIELDS) || !normalizeFix(envelope.fix,Date.parse(envelope.fix.recordedAt)) ||
      !HASH.test(envelope.groupId ?? '') || !HASH.test(envelope.eventKey ?? '')) return false;
  const expected = keys(envelope.scope, Object.fromEntries(FIELDS.map(k => [k,envelope.fix[k]])));
  return expected.groupId === envelope.groupId && expected.eventKey === envelope.eventKey;
}

/**
 * Coalesce up to ten independently authenticated device submissions into one
 * durable broker batch. The authority adapter MUST validate current session,
 * MFA, tenant, driver, device and trip binding, revocation and rate limits.
 * It is a trusted server dependency; never accept a grant from an HTTP body.
 * No bearer, device credential or tracking token is included in the envelope.
 * A queued receipt is not final GPS acceptance; mobile v1 must not use this.
 */
export async function submitGpsRequests(requests, { authorize, publish, clock = Date.now } = {}) {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 10 ||
      typeof authorize !== 'function' || typeof publish !== 'function') throw Error('INGRESS_BOUNDS');
  const results = Array.from({length:requests.length},retry);
  const candidates = await Promise.all(requests.map(async (request,index) => {
    const now = clock();
    if (!exact(request,['authorization','deviceCredential','trackingToken','fix']) ||
        typeof request.authorization !== 'string' || request.authorization.length > 8192 ||
        !/^Bearer [A-Za-z0-9._~-]+$/.test(request.authorization) ||
        typeof request.deviceCredential !== 'string' || !DEVICE.test(request.deviceCredential) ||
        typeof request.trackingToken !== 'string' || !TOKEN.test(request.trackingToken)) {
      results[index] = reject('INVALID_REQUEST'); return null;
    }
    const fix = normalizeFix(request.fix,now);
    if (!fix) { results[index] = reject('INVALID_FIX'); return null; }
    let grant;
    try {
      grant = await authorize({authorization:request.authorization,deviceCredential:request.deviceCredential,
        trackingToken:request.trackingToken});
    } catch { return null; } // unavailable authority: fail closed, retryable
    if (grant?.authorized === false) { results[index] = reject('NOT_AUTHORIZED'); return null; }
    if (!validateGrant(grant,clock())) return null;
    const scope = Object.freeze(Object.fromEntries([...SCOPE,'authorizationVersion'].map(k=>[k,grant[k]])));
    const envelope = Object.freeze({version:2,scope,fix:Object.freeze(fix),...keys(scope,fix)});
    return {index,envelope,expiresAt:grant.expiresAt};
  }));
  // Never put multiple events from one device in a partially successful broker
  // batch. The device's serial submission contract plus persistent cursor
  // protects order on retries; a duplicate group receives retry, not acceptance.
  const seen = new Set();
  const eligible = candidates.filter(item => {
    if (!item || item.expiresAt <= clock() || seen.has(item.envelope.groupId)) return false;
    seen.add(item.envelope.groupId); return true;
  });
  if (!eligible.length) return results;
  let confirmed;
  try { confirmed = await publish(eligible.map(item=>item.envelope)); }
  catch { return results; } // ambiguous enqueue: same identity may be retried
  if (!(confirmed instanceof Set)) return results;
  for (const {index,envelope} of eligible)
    if (confirmed.has(envelope.eventKey))
      results[index] = Object.freeze({state:'queued',receiptId:envelope.eventKey});
  return results;
}

/**
 * SQS FIFO SendMessageBatch adapter. An AWS SDK v3 SQSClient and
 * SendMessageBatchCommand constructor must be supplied by the deployment.
 * No static cloud credentials, custom signing, or implicit default region.
 */
export function createFifoBatchPublisher({client,SendMessageBatchCommand,queueUrl}) {
  if (typeof client?.send !== 'function' || typeof SendMessageBatchCommand !== 'function' ||
      typeof queueUrl !== 'string' ||
      !/^https:\/\/sqs\.ca-central-1\.amazonaws\.com\/[0-9]{12}\/[A-Za-z0-9_-]{1,75}\.fifo$/.test(queueUrl))
    throw Error('QUEUE_CONFIGURATION');
  return async envelopes => {
    if (!Array.isArray(envelopes) || envelopes.length < 1 || envelopes.length > 10 ||
        envelopes.some(e=>!validEnvelope(e)) ||
        new Set(envelopes.map(e=>e.groupId)).size !== envelopes.length)
      throw Error('QUEUE_BATCH_BOUNDS');
    const entries = envelopes.map((e,i)=>({Id:String(i),MessageBody:JSON.stringify(e),
      MessageGroupId:e.groupId,MessageDeduplicationId:e.eventKey}));
    const response = await client.send(new SendMessageBatchCommand({QueueUrl:queueUrl,Entries:entries}));
    const good = response?.Successful ?? [], bad = response?.Failed ?? [];
    if (!Array.isArray(good) || !Array.isArray(bad)) throw Error('QUEUE_RESPONSE');
    const seen = new Set();
    for (const item of [...good,...bad]) {
      if (!item || typeof item.Id !== 'string' || !entries.some(e=>e.Id===item.Id) || seen.has(item.Id))
        throw Error('QUEUE_RESPONSE');
      seen.add(item.Id);
    }
    return new Set(good.filter(item => typeof item.MessageId==='string' && item.MessageId.length>0 &&
      typeof item.SequenceNumber==='string' && /^\d+$/.test(item.SequenceNumber))
      .map(item=>envelopes[Number(item.Id)].eventKey));
  };
}

/**
 * Process received FIFO groups serially, distinct groups in parallel. An
 * injected authoritative commit adapter MUST atomically recheck authorization
 * version, current session/device/trip and cursor, validate movement, write
 * location (or durable terminal rejection), and persist the final receipt.
 * Broker deletion occurs only after that committed receipt. Provider
 * redelivery is expected; commit must be idempotent beyond broker dedup TTL.
 */
export async function processGpsDeliveries(deliveries,{commit,ack,concurrency=8}={}) {
  if (!Array.isArray(deliveries) || deliveries.length < 1 || deliveries.length > 100 ||
      typeof commit !== 'function' || typeof ack !== 'function' ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw Error('CONSUMER_BOUNDS');
  const groups = new Map(), handles = new Set();
  // Validate the whole delivery batch before performing any writes.
  for (const delivery of deliveries) {
    if (!exact(delivery,['envelope','receiptHandle']) || !validEnvelope(delivery.envelope) ||
        typeof delivery.receiptHandle !== 'string' || !delivery.receiptHandle ||
        delivery.receiptHandle.length > 4096 || handles.has(delivery.receiptHandle))
      throw Error('INVALID_DELIVERY');
    handles.add(delivery.receiptHandle);
    const group = groups.get(delivery.envelope.groupId) ?? [];
    group.push(delivery);
    groups.set(delivery.envelope.groupId,group);
  }
  const work = [...groups.values()];
  const summary = {committed:0,duplicate:0,rejected:0,acknowledged:0,deferred:0};
  let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,work.length)},async()=>{
    for (;;) {
      const group=work[next++];
      if (!group) return;
      for (let i=0;i<group.length;i++) {
        const {envelope,receiptHandle}=group[i];
        try {
          const outcome=await commit(envelope);
          if (outcome?.eventKey!==envelope.eventKey || outcome.durable!==true ||
              !['committed','duplicate','rejected'].includes(outcome.status))
            throw Error('UNCONFIRMED_COMMIT');
          summary[outcome.status]++;
          if (await ack(receiptHandle)!==true) throw Error('UNCONFIRMED_ACK');
          summary.acknowledged++;
        } catch {
          // Never advance this device past an unresolved event; redelivery
          // will repeat an already committed event safely.
          summary.deferred+=group.length-i;
          break;
        }
      }
    }
  }));
  return summary;
}
