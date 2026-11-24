import { validEnvelope } from './core.mjs';

// Server-only adapter for logged pgmq queues in the SAME authoritative database.
// Provisioning, grants and the authoritative commit function are separate gates.
// No public RPC, browser API, credentials, network listener or queue auto-creation.
const SHARDS = 32;
const NS = 'safebus-gps-v2-consumer';
const id = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
  && BigInt(value) <= 9223372036854775807n;
const validShard = shard => Number.isInteger(shard) && shard >= 0 && shard < SHARDS;
const queueName = shard => 'safebus_gps_v2_' + String(shard).padStart(2,'0');
export function gpsQueueShard(groupId) {
  if (typeof groupId !== 'string' || !/^[0-9a-f]{64}$/.test(groupId)) throw Error('INVALID_GROUP');
  return Number.parseInt(groupId.slice(0,8),16) % SHARDS;
}

async function transaction(pool,work) {
  if (typeof pool?.connect !== 'function') throw Error('QUEUE_CONFIGURATION');
  const client=await pool.connect();
  let broken;
  try {
    await client.query('begin');
    await client.query("set local statement_timeout = '2s'");
    await client.query("set local lock_timeout = '250ms'");
    await client.query("set local idle_in_transaction_session_timeout = '3s'");
    const result=await work(client);
    await client.query('commit');
    return result;
  } catch(error) {
    try { await client.query('rollback'); }
    catch { broken=new Error('QUEUE_CONNECTION_UNUSABLE'); }
    // Even if commit was ambiguous, never emit a successful receipt.
    throw Error('QUEUE_TRANSACTION_FAILED');
  } finally {
    client.release(broken);
  }
}

/** Send only validated, credential-free envelopes via one bounded transaction.
 * Logged queues must be private; no application caller may invoke pgmq directly.
 * No broker dedup assumption: a repeated enqueue is handled by the persistent
 * authoritative receipt/cursor at commit time.
 */
export function createPgmqBatchPublisher({pool}={}) {
  return async envelopes => {
    if (!Array.isArray(envelopes) || envelopes.length < 1 || envelopes.length > 10 ||
        envelopes.some(e=>!validEnvelope(e)) ||
        new Set(envelopes.map(e=>e.groupId)).size!==envelopes.length)
      throw Error('QUEUE_BATCH_BOUNDS');
    const shards=new Map();
    for(const envelope of envelopes) {
      const shard=gpsQueueShard(envelope.groupId);
      const group=shards.get(shard) ?? [];
      group.push(envelope);shards.set(shard,group);
    }
    return transaction(pool,async client=>{
      for (const [shard,group] of [...shards.entries()].sort((a,b)=>a[0]-b[0])) {
        const {rows}=await client.query(
          'select msg_id::text as msg_id from pgmq.send_batch($1::text,$2::jsonb[],0) as msg_id',
          [queueName(shard),group.map(e=>JSON.stringify(e))]);
        if(rows.length!==group.length || rows.some(row=>!id(row.msg_id)) ||
           new Set(rows.map(row=>row.msg_id)).size!==rows.length) throw Error('QUEUE_SEND_INCOMPLETE');
      }
      // This value is returned to the caller only after COMMIT succeeds.
      return new Set(envelopes.map(e=>e.eventKey));
    });
  };
}

/** One exclusive transaction per shard, across all worker processes.
 * The trusted commitBatch(client,envelopes) adapter MUST use this same
 * transaction/client for authorization, cursor, position and durable receipts.
 * It must not commit independently or perform external I/O. If any receipt
 * or deletion is incomplete, the entire batch is rolled back, including read
 * visibility and any position changes. Do not use pop(), delayed messages,
 * external consumers or unlogged queues. One device maps to one stable shard.
 */
export async function processPgmqShard({pool,shard,commitBatch,limit=128}={}) {
  if (!validShard(shard) || typeof commitBatch!=='function' ||
      !Number.isInteger(limit) || limit<1 || limit>256) throw Error('QUEUE_CONSUMER_BOUNDS');
  return transaction(pool,async client=>{
    const lock=await client.query(
      'select pg_try_advisory_xact_lock(hashtext($1::text),$2::integer) as acquired',[NS,shard]);
    if(lock.rows[0]?.acquired!==true) return {state:'busy',processed:0};
    const {rows}=await client.query(
      'select msg_id::text as msg_id,message from pgmq.read($1::text,30,$2::integer) order by msg_id::bigint',
      [queueName(shard),limit]);
    if(!Array.isArray(rows) || rows.length>limit ||
       rows.some(r=>!id(r.msg_id)||!validEnvelope(r.message)||gpsQueueShard(r.message.groupId)!==shard) ||
       new Set(rows.map(r=>r.msg_id)).size!==rows.length ||
       rows.some((r,i)=>i>0&&BigInt(r.msg_id)<=BigInt(rows[i-1].msg_id))) throw Error('QUEUE_READ_INVALID');
    if(!rows.length) return {state:'empty',processed:0};
    const envelopes=rows.map(r=>r.message);
    const outcomes=await commitBatch(client,envelopes);
    if(!Array.isArray(outcomes)||outcomes.length!==rows.length ||
      outcomes.some((o,i)=>o?.eventKey!==envelopes[i].eventKey||o.durable!==true||
        !['committed','duplicate','rejected'].includes(o.status))) throw Error('QUEUE_COMMIT_INCOMPLETE');
    const ids=rows.map(r=>r.msg_id);
    const deleted=await client.query(
      'select msg_id::text as msg_id from pgmq.delete($1::text,$2::bigint[]) as msg_id',
      [queueName(shard),ids]);
    if(deleted.rows.length!==ids.length || new Set(deleted.rows.map(r=>r.msg_id)).size!==ids.length ||
      deleted.rows.some(r=>!ids.includes(r.msg_id))) throw Error('QUEUE_DELETE_INCOMPLETE');
    return {state:'processed',processed:ids.length};
  });
}
