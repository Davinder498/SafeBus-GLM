import { setTimeout as delay } from 'node:timers/promises';

// A successful channel join does not guarantee the database broadcast replication
// slot has reached its consistent point. A message committed before that point can
// be permanently missed. Require an active streaming sender before the first send.
export const broadcastReadyQuery = `select exists (
  select 1 from pg_catalog.pg_replication_slots s
  join pg_catalog.pg_stat_replication r on r.pid=s.active_pid
  where s.slot_name like 'supabase_realtime_messages_replication_slot%'
    and s.database=current_database() and s.plugin='pgoutput'
    and s.slot_type='logical' and s.active
    and s.restart_lsn is not null and s.confirmed_flush_lsn is not null
    and r.state='streaming'
) as ready`;

export async function sendRecoveryProbe(db, { nonce, topic }, wait = delay) {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await db.query(broadcastReadyQuery)).rows[0]?.ready === true) {
      ready = true;
      break;
    }
    if (attempt < 39) await wait(500);
  }
  if (!ready) throw Error('BROADCAST_REPLICATION_NOT_READY');
  await db.query('select realtime.send($1::jsonb,$2,$3,true)', [
    JSON.stringify({ nonce }),
    'capacity_probe',
    topic,
  ]);
  // realtime.send catches insertion errors and returns void with a warning. Do
  // not misreport a swallowed insertion failure as a network delivery timeout.
  const stored = await db.query(
    `select exists (
    select 1 from realtime.messages where topic=$1 and event='capacity_probe'
      and private and extension='broadcast' and payload->>'nonce'=$2
      and inserted_at >= now() - interval '1 minute'
  ) as stored`,
    [topic, nonce],
  );
  if (stored.rows[0]?.stored !== true) throw Error('BROADCAST_INSERT_NOT_CONFIRMED');
}
