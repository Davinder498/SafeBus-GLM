#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';
const { Client } = pg;
const DB='SAFEBUS_QA_SEED_DATABASE_URL', CONF='SAFEBUS_QA_SEED_CONFIRM';
const ids={tenant:'14b00000-0000-0000-0000-000000000001',driver:'14b00000-0000-0000-0000-000000000007',bus:'14b00000-0000-0000-0000-000000000012',route:'14b00000-0000-0000-0000-000000000013',tripM:'14b00000-0000-0000-0000-000000000021',tripE:'14b00000-0000-0000-0000-000000000022'};
const scenario=process.argv[2];
const scenarios={
  no_location:null,
  before_first_stop:[51.0005,-114.0000,'now()',null],
  between_stops:[51.0060,-114.0000,'now()',8],
  near_relevant_stop:[51.0098,-114.0000,'now()',6],
  passed_stop:[51.0180,-114.0000,'now()',8],
  stale_location:[51.0060,-114.0000,"now() - interval '5 minutes'",8],
  future_timestamp:[51.0060,-114.0000,"now() + interval '5 minutes'",8],
  missing_speed:[51.0060,-114.0000,'now()',null],
  very_low_speed:[51.0060,-114.0000,'now()',0.5],
  unusually_high_speed:[51.0060,-114.0000,'now()',35],
  valid_measured_speed:[51.0060,-114.0000,'now()',10]
};
if(!scenario || !(scenario in scenarios) || process.argv.includes('--help')){console.log(`Usage: pnpm qa:safe-eta:scenario <${Object.keys(scenarios).join('|')}> [morning|evening]`);process.exit(scenario?1:0)}
if(process.env[CONF] !== 'DEV_ONLY') throw new Error(`${CONF} must be exactly DEV_ONLY`); const url=process.env[DB]; if(!url) throw new Error(`missing ${DB}`);
const tripType=(process.argv[3]??'morning')==='evening'?'evening':'morning'; const tripId=tripType==='evening'?ids.tripE:ids.tripM;
const c=new Client({connectionString:url,application_name:'safebus-safe-eta-scenario',ssl:{rejectUnauthorized:false}});
await c.connect();
try{await c.query('begin');
await c.query(`update public.driver_trips set status='completed', ended_at=now() where id in ($1,$2) and status='active'`,[ids.tripM,ids.tripE]);
await c.query(`insert into public.driver_trips(id,tenant_id,driver_id,bus_id,route_id,trip_type,status,service_date,started_at) values($1,$2,$3,$4,$5,$6,'active',current_date,now()-interval '10 minutes') on conflict(id) do update set trip_type=excluded.trip_type,status='active',ended_at=null,started_at=excluded.started_at`,[tripId,ids.tenant,ids.driver,ids.bus,ids.route,tripType]);
await c.query(`delete from public.driver_trip_current_locations where driver_trip_id=$1`,[tripId]);
const s=scenarios[scenario];
if(s){await c.query(`insert into public.driver_trip_current_locations(driver_trip_id,tenant_id,driver_id,bus_id,route_id,latitude,longitude,speed_mps,source,recorded_at) values($1,$2,$3,$4,$5,$6,$7,$8,'manual',${s[2]}) on conflict(driver_trip_id) do update set latitude=excluded.latitude, longitude=excluded.longitude, speed_mps=excluded.speed_mps, recorded_at=excluded.recorded_at, updated_at=now()`,[tripId,ids.tenant,ids.driver,ids.bus,ids.route,s[0],s[1],s[3]]);}
await c.query('commit'); console.log(`Applied Safe ETA scenario ${scenario} for ${tripType}.`)
}catch(e){await c.query('rollback').catch(()=>{}); throw e}finally{await c.end()}
