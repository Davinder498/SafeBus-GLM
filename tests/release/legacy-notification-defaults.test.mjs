import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  operationalSnapshot,
  operationalRestoreSql,
  operationalDigest,
  verifyOperationalSnapshot,
} from '../../scripts/lib/operational-rollout.mjs';
const manifest = JSON.parse(
  await fs.readFile('config/pending/legacy-notification-defaults.json', 'utf8'),
);
const sql = await fs.readFile(manifest.migration, 'utf8');
// Production definitions are pinned in the manifest; fixture functions reproduce update effects.
const config = { ...manifest, functions: [] };
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create schema safebus_private;
 create table tenants(id uuid primary key,status text,created_at timestamptz);
 create table guardian_notification_delivery_policies(tenant_id uuid primary key references tenants,
 privacy_review_status text,privacy_approved_at timestamptz,privacy_approved_by uuid,
 tenant_daily_limit int,tenant_per_minute_limit int,push_tenant_daily_limit int,push_tenant_per_minute_limit int,updated_at timestamptz default now());
 create function safebus_private.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
 create function safebus_private.disposal_account_guard() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger disposal_account_guard before insert or update on guardian_notification_delivery_policies for each row execute function safebus_private.disposal_account_guard('privacy_approved_by');
 create trigger set_updated_at_guardian_notification_delivery_policies before update on guardian_notification_delivery_policies for each row execute function safebus_private.set_updated_at();
 create table recipient_choices(id int,opted_out boolean); insert into recipient_choices values(1,true);
 create table outbox(id int);`);
  for (const [id, status] of [
    [manifest.notificationRepairs[0].tenant_id, 'pending'],
    ['00000000-0000-0000-0000-000000000001', 'rejected'],
  ]) {
    await db.query('insert into tenants values($1,$2,$3)', [
      id,
      'active',
      '2026-08-05T19:09:07.505273Z',
    ]);
    await db.query(
      'insert into guardian_notification_delivery_policies(tenant_id,privacy_review_status,tenant_daily_limit,tenant_per_minute_limit,push_tenant_daily_limit,push_tenant_per_minute_limit) values($1,$2,10000000,200000,10000000,200000)',
      [id, status],
    );
  }
  return db;
}
test('bounded repair preserves other authorities, quotas and choices; recovery restores availability', async (t) => {
  assert.equal(operationalDigest(sql), manifest.migrationSha256);
  const db = await fixture(t);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  await db.exec('begin');
  await db.exec(sql);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  assert.equal(
    (
      await db.query(
        "select privacy_review_status from guardian_notification_delivery_policies where tenant_id='00000000-0000-0000-0000-000000000001'",
      )
    ).rows[0].privacy_review_status,
    'rejected',
  );
  assert.deepEqual((await db.query('select * from recipient_choices')).rows, [
    { id: 1, opted_out: true },
  ]);
  assert.equal((await db.query('select count(*)::int as n from outbox')).rows[0].n, 0);
  await db.exec(operationalRestoreSql(before, config));
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'before');
  await db.exec('rollback');
  assert.deepEqual(await operationalSnapshot(db, config), before);
});
for (const change of [
  "privacy_review_status='rejected'",
  'tenant_daily_limit=7',
  "privacy_approved_by='00000000-0000-0000-0000-000000000002'",
])
  test(`repair refuses changed policy: ${change}`, async (t) => {
    const db = await fixture(t);
    await db.exec(
      `update guardian_notification_delivery_policies set ${change} where tenant_id='${manifest.notificationRepairs[0].tenant_id}'`,
    );
    await assert.rejects(db.exec(sql), /baseline changed/);
  });
test('repair refuses inactive authority and missing row', async (t) => {
  const db = await fixture(t);
  await db.exec("update tenants set status='suspended'");
  await assert.rejects(db.exec(sql), /baseline changed/);
  await db.exec('delete from guardian_notification_delivery_policies');
  await assert.rejects(db.exec(sql), /baseline changed/);
});
test('recovery refuses a later policy change', async (t) => {
  const db = await fixture(t);
  const before = await operationalSnapshot(db, config);
  await db.exec(sql);
  await db.exec('update guardian_notification_delivery_policies set push_tenant_daily_limit=9');
  await assert.rejects(db.exec(operationalRestoreSql(before, config)), /recovery state changed/);
});
test('already installed state is verified; SQL is not silently reapplied', async (t) => {
  const db = await fixture(t);
  await db.exec(sql);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  await assert.rejects(db.exec(sql), /baseline changed/);
});
test('unexpected trigger prevents repair', async (t) => {
  const db = await fixture(t);
  await db.exec(
    'create trigger extra before update on guardian_notification_delivery_policies for each row execute function safebus_private.set_updated_at()',
  );
  await assert.rejects(db.exec(sql), /trigger inventory changed/);
});
