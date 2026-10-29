// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createUnifiedNotificationDb,
  databaseClient,
  readUnifiedMigration,
  startTrip,
  recordEvent,
} from '../../../../tests/release/fixtures/unified-notifications-db.mjs';
import {
  operationalDigest,
  operationalSnapshot,
  operationalRestoreSql,
  verifyOperationalSnapshot,
  rehearseOperational,
} from '../../../../scripts/lib/operational-rollout.mjs';
let db, client, config, sql;
beforeAll(async () => {
  db = await createUnifiedNotificationDb({ migrate: false });
  client = databaseClient(db);
  config = JSON.parse(
    await readFile('../../config/pending/unified-notification-delivery.json', 'utf8'),
  );
  sql = await readUnifiedMigration();
}, 60_000);
afterAll(async () => db?.close());
it('rehearses the exact protected manifest without changing recipient data, then restores functions, tables, quotas and schedule', async () => {
  expect(operationalDigest(sql.replaceAll('\r', ''))).toBe(config.migrationSha256);
  const before = await operationalSnapshot(client, config);
  verifyOperationalSnapshot(before, config, 'before');
  await rehearseOperational(client, sql, config);
  expect(await operationalSnapshot(client, config)).toEqual(before);
  await db.exec('begin');
  try {
    await startTrip(db);
    await recordEvent(db);
    const saved = (await db.query('select * from safebus_private.pickup_dropoff_event_copies'))
      .rows;
    expect(saved).toHaveLength(1);
    await db.exec(sql);
    verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'after');
    expect(
      (await db.query('select * from safebus_release.pickup_dropoff_event_copies')).rows,
    ).toEqual(saved);
    const restore = operationalRestoreSql(before, config);
    expect(operationalRestoreSql(before, config)).toBe(restore);
    await db.exec(restore);
    expect(await operationalSnapshot(client, config)).toEqual(before);
    expect(
      (await db.query('select * from safebus_private.pickup_dropoff_event_copies')).rows,
    ).toEqual(saved);
  } finally {
    await db.exec('rollback');
  }
}, 30_000);
it.each([
  'grant execute on function public.resolve_notification_email_payload(uuid) to authenticated',
  'grant select on safebus_private.notification_audience_queue to authenticated',
  "update cron.job set schedule='* * * * *'",
  'alter table guardian_notification_outbox drop column worker_id',
  'drop index push_notification_due_authority_idx',
  'update guardian_notification_delivery_policies set push_tenant_daily_limit=51 where push_tenant_daily_limit=50',
])('rejects installed drift: %s', async (change) => {
  await db.exec('begin');
  try {
    await db.exec(sql);
    await db.exec(change);
    const snapshot = await operationalSnapshot(client, config);
    expect(() => verifyOperationalSnapshot(snapshot, config, 'after')).toThrow(/OPERATIONAL_/);
  } finally {
    await db.exec('rollback');
  }
});
it('refuses rollback while acknowledged trip audience work is pending', async () => {
  const before = await operationalSnapshot(client, config);
  await db.exec('begin');
  try {
    await db.exec(sql);
    await startTrip(db);
    expect(
      (await db.query('select * from safebus_private.notification_audience_queue')).rows,
    ).toHaveLength(1);
    await expect(db.exec(operationalRestoreSql(before, config))).rejects.toThrow(
      'must drain before rollback',
    );
  } finally {
    await db.exec('rollback');
  }
});
