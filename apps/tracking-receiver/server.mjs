import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {createReceiver} from './receiver.mjs';
import {receiverConfig} from './config.mjs';
import {receiverDatabaseRoleAllowed} from './database-role.mjs';

async function start() {
  const {url, key, port, connectionString} = receiverConfig(process.env);
  const ca = await readFile(process.env.SAFEBUS_RECEIVER_DATABASE_CA, 'utf8');
  const pool = new pg.Pool({connectionString, ssl:{ca,rejectUnauthorized:true},
    max:4, connectionTimeoutMillis:2000, application_name:'safebus-gps-receiver'});
  pool.on('error', () => console.error('Idle receiver database connection failed'));
  const {auth} = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init) => fetch(input,{...init,signal:AbortSignal.any(
      [AbortSignal.timeout(3000),init?.signal].filter(Boolean))})}});
  try {
    if (!await receiverDatabaseRoleAllowed(pool)) {
      console.error('Receiver database role failed the startup privilege check');
      throw new Error('Unexpected database role');
    }
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
