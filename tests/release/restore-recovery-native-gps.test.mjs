import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { reviewedOriginalFunction, restoreRecoveryGps } from '../../scripts/restore-recovery-native-gps.mjs';
import { GPS_ORIGINAL_MD5 } from '../../scripts/lib/recovery-native-gps-comparison.mjs';

const OPTIMIZED='cc339d880a35380907eab09b456739c2';
const acl=['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres'];
function fake(current=OPTIMIZED, { failRestore=false, grants=acl }={}){
 let md5=current, snapshot=null;
 const calls=[];
 return {
  calls,
  md5:()=>md5,
  db:{
   async query(sql){
    calls.push(sql);
    if(sql.includes('from pg_proc p')) return {rows:[{md5,owner:'postgres',acl:grants}]};
    if(sql==='begin'){snapshot=md5;return {rows:[]};}
    if(sql==='rollback'){md5=snapshot??md5;snapshot=null;return {rows:[]};}
    if(sql==='commit'){snapshot=null;return {rows:[]};}
    if(sql.includes('CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(')){
     if(failRestore)throw Error('SIMULATED_FAILURE');
     md5=GPS_ORIGINAL_MD5;
    }
    return {rows:[]};
   }
  }
 };
}

test('reviewed source restores precisely the original native GPS RPC',async()=>{
 const source=await fs.readFile('supabase/migrations/pending/20261109214533_remove_gps_history.sql','utf8');
 const def=reviewedOriginalFunction(source);
 assert.match(def,/^CREATE OR REPLACE FUNCTION public\.ingest_driver_location_event\(/);
 assert.ok(def.endsWith('$function$;'));
 assert.ok(def.includes('pg_advisory_xact_lock'));
 assert.ok(def.includes('driver_tracking_state'));
 assert.ok(!def.includes('CREATE OR REPLACE FUNCTION safebus_private.'));
});

test('protected Recovery repair replaces only the known optimized GPS function',async()=>{
 const d=fake();
 const r=await restoreRecoveryGps(d.db,{definition:'CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('});
 assert.deepEqual({before:r.before,after:r.after,restored:r.restored},
   {before:OPTIMIZED,after:GPS_ORIGINAL_MD5,restored:true});
 assert.equal(d.md5(),GPS_ORIGINAL_MD5);
 assert.ok(d.calls.some(x=>x.includes('revoke usage on schema public,safebus_private from authenticated')));
 assert.equal(d.calls.filter(x=>x==='commit').length,1);
});

test('repair is idempotent for original baseline, but still quarantines Recovery',async()=>{
 const d=fake(GPS_ORIGINAL_MD5);
 await restoreRecoveryGps(d.db,{definition:'CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('});
 assert.equal(d.calls.filter(x=>x.includes('CREATE OR REPLACE FUNCTION')).length,0);
 assert.ok(d.calls.some(x=>x.includes('revoke usage on schema')));
});

test('repair refuses unrelated functions, privilege drift, and foreign targets',async()=>{
 for(const config of [
  {current:'0123456789abcdef0123456789abcdef'},
  {current:OPTIMIZED,grants:[...acl,'PUBLIC=X/postgres']}
 ]){
  const d=fake(config.current,{grants:config.grants});
  await assert.rejects(restoreRecoveryGps(d.db,{definition:'CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('}),
    /RECOVERY_GPS_RESTORE_(DRIFT|CATALOG)/);
  assert.ok(!d.calls.includes('begin'));
 }
 await assert.rejects(restoreRecoveryGps(fake().db,{
  definition:'CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(',target:'ckrkfylsyihwouvesypm'
 }),/RECOVERY_GPS_RESTORE_TARGET/);
});

test('restore SQL failure rolls back to the previously observed safe state',async()=>{
 const d=fake(OPTIMIZED,{failRestore:true});
 await assert.rejects(restoreRecoveryGps(d.db,{
  definition:'CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('
 }),/SIMULATED_FAILURE/);
 assert.equal(d.md5(),OPTIMIZED);
 assert.ok(d.calls.includes('rollback'));
});

test('protected workflow offers separately confirmed restore without running a capacity workload',async()=>{
 const workflow=await fs.readFile('.github/workflows/run-recovery-capacity.yml','utf8');
 assert.match(workflow,/inputs.workload == 'android_gps_restore'/);
 assert.match(workflow,/RESTORE_RECOVERY_GPS_BASELINE/);
 assert.match(workflow,/if: inputs.workload != 'android_gps_restore'/);
 assert.match(workflow,/inputs.workload != 'android_gps_restore' && inputs.confirmation == 'RUN_RECOVERY_CAPACITY'/);
 assert.match(workflow,/inputs.workload != 'android_gps_direct_compare' && inputs.workload != 'android_gps_restore' && inputs.confirmation == 'RUN_RECOVERY_CAPACITY'/);
 assert.match(workflow,/inputs.buses == '100' && inputs.workload == 'android_gps_direct_compare' && inputs.confirmation == 'RUN_RECOVERY_DIRECT_GPS_100'/);
 assert.match(workflow,/run: node scripts\/restore-recovery-native-gps\.mjs/);
});
