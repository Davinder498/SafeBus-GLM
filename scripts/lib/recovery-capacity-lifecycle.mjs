import { setTimeout as delay } from 'node:timers/promises';
import { capacityQuarantine } from './recovery-capacity-cleanup.mjs';

// Cleanup has its own budget; workload cancellation must never cancel cleanup.
// Retry only idempotent quarantine, never a measured request or fixture deletion.
export async function quarantineCapacity(db, wait = delay) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.query('rollback');
      await db.query("set statement_timeout='20s';set lock_timeout='2s'");
      await db.query('revoke usage on schema public,safebus_private from authenticated');
      await capacityQuarantine(db);
      return;
    } catch (error) {
      if (!['57014', '55P03'].includes(error.code) || attempt === 2) throw error;
      await wait(2000);
    }
  }
}

export async function disconnectCapacityClients(accounts) {
  // Always close sockets, even if removing channels or quarantining failed.
  await Promise.allSettled(
    accounts.map(async ({ client }) => {
      try {
        await client.removeAllChannels();
      } finally {
        client.auth.stopAutoRefresh();
        await client.realtime.disconnect();
      }
    }),
  );
}

export function capacityFetch(input, init, { origin, signal, fetchImpl = fetch }) {
  if (new URL(typeof input === 'string' ? input : input.url).origin !== origin)
    throw Error('CAPACITY_ORIGIN_REJECTED');
  return fetchImpl(input, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.any([
      AbortSignal.timeout(10000),
      ...[signal, init?.signal].filter(Boolean),
    ]),
  });
}
