import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

// Telemetry is numeric and cannot change authorization or acknowledgement.
const report=(observe,stage,ms,count=1)=>{try{observe?.(stage,ms,count);}catch{/* metrics never break ingestion */}};
export const BATCH_TRANSACTION_SETUP="begin; set local statement_timeout='2s'; set local lock_timeout='250ms'; set local idle_in_transaction_session_timeout='3s'";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fields=['p_tracking_token','p_device_credential','p_event_id','p_sequence','p_recorded_at',
  'p_latitude','p_longitude','p_accuracy_m','p_heading_deg','p_speed_mps','p_battery_percent','p_connectivity'];
const fail=status=>({status,body:{error:status===401?'unauthorized':status===403?'forbidden':
  status===400?'invalid_request':'temporarily_unavailable'}});
const finite=v=>v===null||(typeof v==='number'&&Number.isFinite(v));
function validFix(f) {
  return f&&typeof f==='object'&&!Array.isArray(f)&&Object.keys(f).length===fields.length&&
    fields.every(k=>Object.hasOwn(f,k))&&
    typeof f.p_tracking_token==='string'&&/^sbus_track_v1_[A-Za-z0-9_-]{40,80}$/.test(f.p_tracking_token)&&
    typeof f.p_device_credential==='string'&&/^sbus_device_v1_[A-Za-z0-9_-]{40,80}$/.test(f.p_device_credential)&&
    typeof f.p_event_id==='string'&&UUID.test(f.p_event_id)&&
    Number.isSafeInteger(f.p_sequence)&&f.p_sequence>0&&
    typeof f.p_recorded_at==='string'&&f.p_recorded_at.length<=40&&Number.isFinite(Date.parse(f.p_recorded_at))&&
    ['p_latitude','p_longitude','p_accuracy_m','p_heading_deg','p_speed_mps','p_battery_percent'].every(k=>finite(f[k]))&&
    (f.p_battery_percent===null||Number.isInteger(f.p_battery_percent))&&
    ['wifi','cellular','offline','unknown'].includes(f.p_connectivity);
}

/** Use the existing official Supabase client, configured for the trusted project.
 * getClaims verifies signature (or server-verifies legacy symmetric tokens).
 * Do not substitute a decoder or trust identity in request JSON.
 */
export function createSupabaseClaimsVerifier({auth,issuer,clock=Date.now}={}) {
  if(typeof auth?.getClaims!=='function'||typeof issuer!=='string'||!/^https:\/\/[a-z0-9]+\.supabase\.co\/auth\/v1$/.test(issuer))
    throw Error('AUTH_CONFIGURATION');
  return async bearer=>{
    const {data,error}=await auth.getClaims(bearer);
    if(error){
      if([400,401,403].includes(error.status)||error.name==='AuthInvalidJwtError')return null;
      throw Error('AUTH_UNAVAILABLE');
    }
    const c=data?.claims;
    if(!c||c.iss!==issuer||c.role!=='authenticated'||
       !(c.aud==='authenticated'||(Array.isArray(c.aud)&&c.aud.includes('authenticated')))||
       typeof c.sub!=='string'||!UUID.test(c.sub)||typeof c.session_id!=='string'||!UUID.test(c.session_id)||
       !['aal1','aal2'].includes(c.aal)||!Number.isSafeInteger(c.exp)||c.exp<=clock()/1000||
       (c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf>clock()/1000)))return null;
    return {sub:c.sub,session_id:c.session_id,role:c.role,aal:c.aal,exp:c.exp};
  };
}

/** A single database round trip/transaction per batch (plus transaction controls).
 * Only a dedicated trusted gateway role may get EXECUTE on the private function.
 * The query is parameterized and never logs payloads, bearer tokens or errors.
 */
export function createDirectBatchWriter({pool,observe}={}) {
  if(typeof pool?.connect!=='function')throw Error('DATABASE_CONFIGURATION');
  return async items=>{
    const acquiredAt=performance.now();
    const client=await pool.connect();
    report(observe,'pool_acquire',performance.now()-acquiredAt,items.length);
    let broken;
    const query=async(stage,...args)=>{
      const start=performance.now();
      try{return await client.query(...args);}
      finally{report(observe,stage,performance.now()-start,items.length);}
    };
    try{
      // Constant SQL only. PostgreSQL simple protocol supports multiple statements;
      // never interpolate request data here. Keep the batch query parameterized.
      await query('transaction_setup',BATCH_TRANSACTION_SETUP);
      const {rows}=await query('sql_round_trip','select safebus_private.ingest_verified_driver_location_batch($1::jsonb) as result',
        [JSON.stringify(items)]);
      const outcomes=rows[0]?.result;
      if(!Array.isArray(outcomes)||outcomes.length!==items.length||
        new Set(outcomes.map(o=>o?.id)).size!==items.length||
        outcomes.some(o=>!items.some(i=>i.id===o?.id)||![200,401,403].includes(o.status)||
          (o.status===200&&(typeof o.body?.accepted!=='boolean'||typeof o.body?.stopTracking!=='boolean'))))
        throw Error('INCOMPLETE_BATCH');
      await query('commit_round_trip','commit');
      return new Map(outcomes.map(o=>[o.id,o.status===200?{status:200,body:o.body}:fail(o.status)]));
    }catch{
      try{await client.query('rollback');}catch{broken=Error('CONNECTION_UNUSABLE');}
      throw Error('BATCH_UNAVAILABLE');
    }finally{client.release(broken);}
  };
}

/** Bounded process-local microbatch, not a durable queue. No early ACK.
 * A driver retains its existing encrypted local fix until final DB response.
 * At most one outstanding fix per device credential and principal. Global
 * deployment rate limiting and multi-instance admission are separate gates.
 */
export function createDirectGpsBatcher({verify,write,batchSize=50,maxWaitMs=50,maxInFlight=4,maxPending=500,observe}={}){
  if(typeof verify!=='function'||typeof write!=='function'||
    !Number.isInteger(batchSize)||batchSize<1||batchSize>100||
    !Number.isInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>100||
    !Number.isInteger(maxInFlight)||maxInFlight<1||maxInFlight>16||
    !Number.isInteger(maxPending)||maxPending<batchSize||maxPending>5000)throw Error('BATCH_CONFIGURATION');
  let active=0,admitted=0,timer=null,closed=false;
  const waiting=[],devices=new Set(),principals=new Set();
  function schedule(){
    if(timer!==null||closed||!waiting.length||active>=maxInFlight)return;
    // The collection deadline is measured from the oldest queued fix, not
    // restarted whenever a busy worker finishes.
    const remaining=Math.max(0,maxWaitMs-(performance.now()-waiting[0].queuedAt));
    timer=setTimeout(()=>{timer=null;flush();},remaining);
  }
  function flush(){
    if(active>=maxInFlight||!waiting.length)return;
    if(timer!==null){clearTimeout(timer);timer=null;}
    const batch=waiting.splice(0,batchSize);active++;
    const now=performance.now();
    for(const e of batch)report(observe,'batch_wait',now-e.queuedAt);
    void Promise.resolve().then(()=>write(batch.map(e=>e.item))).then(
      results=>{for(const e of batch)e.resolve(results instanceof Map?results.get(e.item.id)??fail(503):fail(503));},
      ()=>{for(const e of batch)e.resolve(fail(503));}
    ).finally(()=>{
      active--;
      if(waiting.length>=batchSize)flush();else schedule();
    });
    if(waiting.length>=batchSize)flush();else schedule();
  }
  return {
    async submit(bearer,fix){
      if(closed||admitted>=maxPending)return fail(503);
      if(typeof bearer!=='string'||bearer.length>8192||!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer))return fail(401);
      if(!validFix(fix))return fail(400);
      admitted++;
      const device=fix.p_device_credential;
      let principal,ownsDevice=false,ownsPrincipal=false;
      try{
        const authStart=performance.now();
        let claims;
        try{claims=await verify(bearer.slice(7));}
        finally{report(observe,'auth_verify',performance.now()-authStart);}
        if(!claims)return fail(401);
        if(closed||devices.has(device)||principals.has(claims.sub))return fail(503);
        devices.add(device);ownsDevice=true;
        principal=claims.sub;principals.add(principal);ownsPrincipal=true;
        const item={id:randomUUID(),claims,fix:Object.fromEntries(fields.map(k=>[k,fix[k]]))};
        return await new Promise(resolve=>{
          waiting.push({item,resolve,queuedAt:performance.now()});
          if(waiting.length>=batchSize)flush();else schedule();
        });
      }catch{return fail(503);}
      finally{admitted--;if(ownsDevice)devices.delete(device);if(ownsPrincipal)principals.delete(principal);}
    },
    close(){
      closed=true;if(timer!==null)clearTimeout(timer);timer=null;
      for(const e of waiting.splice(0))e.resolve(fail(503));
    },
  };
}

/** Standalone candidate endpoint. A TLS reverse proxy, provider-level rate
 * limiting, bounded auth verification and connection limits are required.
 * Not mounted in production. No raw error logging or request-body logging.
 */
export function createDirectGpsServer({batcher}={}){
  if(typeof batcher?.submit!=='function')throw Error('SERVER_CONFIGURATION');
  const server=createServer({requestTimeout:5000,headersTimeout:5000,maxHeaderSize:16384},async(req,res)=>{
    const send=({status,body})=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{
      'content-type':'application/json','cache-control':'no-store',...(status===503?{'retry-after':'1'}:{})
    });res.end(JSON.stringify(body));}};
    if(req.method!=='POST'||req.url!=='/tracking/v2/location'){send({status:404,body:{error:'not_found'}});return;}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){send(fail(400));return;}
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){
        size+=chunk.length;if(size>4096){send(fail(400));req.destroy();return;}chunks.push(chunk);
      }
      let body;
      try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(fail(400));return;}
      send(await batcher.submit(req.headers.authorization,body));
    }catch{send(fail(503));}
  });
  server.maxConnections=1000;
  return server;
}
