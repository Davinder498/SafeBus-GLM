import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {createReceiver} from './receiver.mjs';

async function start() {
  const url = process.env.SAFEBUS_RECEIVER_SUPABASE_URL;
  const key = process.env.SAFEBUS_RECEIVER_PUBLISHABLE_KEY;
  const project = 'deladookciebwvqojhkv';
  if (url !== `https://${project}.supabase.co` || !key?.startsWith('sb_publishable_'))
    throw new Error('Invalid auth configuration');
  const port = Number(process.env.SAFEBUS_RECEIVER_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const database = new URL(process.env.SAFEBUS_RECEIVER_DATABASE_URL);
  const direct = database.hostname === `db.${project}.supabase.co` && database.username === 'safebus_gps_receiver';
  const pooled = database.hostname.endsWith('.pooler.supabase.com') && database.username === `safebus_gps_receiver.${project}`;
  if (!(direct || pooled) || !['postgresql:', 'postgres:'].includes(database.protocol) || database.search || database.hash ||
      !database.password)
    throw new Error('Invalid receiver database configuration');
  const ca = await readFile(process.env.SAFEBUS_RECEIVER_DATABASE_CA, 'utf8');
  const pool = new pg.Pool({connectionString:database.href, ssl:{ca,rejectUnauthorized:true},
    max:4, connectionTimeoutMillis:2000, application_name:'safebus-gps-receiver'});
  pool.on('error', () => console.error('Idle receiver database connection failed'));
  const {auth} = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init) => fetch(input,{...init,signal:AbortSignal.any(
      [AbortSignal.timeout(3000),init?.signal].filter(Boolean))})}});
  try {
    const {rows:[role]} = await pool.query(`select current_user = 'safebus_gps_receiver'
      and not (rolsuper or rolbypassrls or rolcreaterole)
      and has_function_privilege(current_user,'safebus_private.ingest_verified_driver_location_batch(jsonb)','execute')
      as allowed from pg_roles where rolname=current_user`);
    if (!role?.allowed) throw new Error('Unexpected database role');
    const receiver = createReceiver({pool,auth,issuer:url+'/auth/v1'});
    const listening = once(receiver.server,'listening');
    receiver.server.listen(port,'127.0.0.1');
    await listening;
    const stop = async () => {
      process.removeListener('SIGINT',stop);
      process.removeListener('SIGTERM',stop);
      try { await receiver.close(); } finally { await pool.end(); }
    };
    process.once('SIGINT',stop);
    process.once('SIGTERM',stop);
  } catch (error) {
    await pool.end();
    throw error;
  }
}
start().catch(() => { console.error('Tracking receiver startup failed'); process.exitCode=1; });
