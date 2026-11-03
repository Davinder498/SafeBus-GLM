import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  trackingQueueDb,
  queueBaseline,
  queueMigration,
  id,
  start,
  register,
  bind,
  proof,
  ingest,
} from './fixtures/tracking-queue-db.mjs';
import {
  operationalSnapshot,
  verifyOperationalSnapshot,
  operationalRestoreSql,
  rehearseOperational,
} from '../../scripts/lib/operational-rollout.mjs';

const readConfig = async () =>
  JSON.parse(
    await fs.readFile(
      new URL('../../config/pending/tracking-queue-recovery.json', import.meta.url),
      'utf8',
    ),
  );
const clientFor = (db) => ({
  query: async (sql, args) =>
    args ? db.query(sql, args) : ((await db.exec(sql)).at(-1) ?? { rows: [] }),
});
async function installed() {
  const db = await trackingQueueDb();
  try {
    await db.exec(await queueMigration());
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
const time = async (db, expression) =>
  (await db.query(`select (${expression})::text as t`)).rows[0].t;
async function setup(db) {
  const run = await start(db),
    device = await register(db);
  await bind(db, run.trackingToken, device);
  await db.query(
    "update bus_tracking_sessions set started_at=now()-interval '2 hours' where session_token_hash=md5($1)",
    [run.trackingToken],
  );
  await db.query("update driver_trips set started_at=now()-interval '2 hours' where id=$1", [
    run.trip.id,
  ]);
  return { run, device };
}

test('actual QR rescan, credential rotations, completed-trip backlog and a new trip preserve original events', async () => {
  const db = await installed();
  try {
    const { run: first, device: d1 } = await setup(db);
    const recorded = await time(db, "now()-interval '30 minutes'");
    const next = await start(db),
      d2 = await register(db);
    await bind(db, next.trackingToken, d2);
    assert.equal(next.trip.id, first.trip.id);
    assert.notEqual(d2.deviceCredential, d1.deviceCredential);
    assert.deepEqual(await proof(db, first.trackingToken, d2.deviceCredential), {
      authorized: true,
      protocolVersion: 1,
    });
    assert.equal(
      (await db.query('select count(*)::int as n from driver_trip_location_updates')).rows[0].n,
      0,
    );
    await assert.rejects(
      ingest(db, first.trackingToken, d1.deviceCredential, 1, recorded),
      /device is not valid/,
    );
    const accepted = await ingest(db, first.trackingToken, d2.deviceCredential, 1, recorded);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.stopTracking, true);
    assert.equal(
      (await ingest(db, first.trackingToken, d2.deviceCredential, 1, recorded)).duplicate,
      true,
    );
    const afterRetirement = await time(db, "now()+interval '1 second'");
    assert.equal(
      (await ingest(db, first.trackingToken, d2.deviceCredential, 2, afterRetirement))
        .rejectionReason,
      'stale_fix',
    );
    await db.query('select public.end_driver_trip($1)', [first.trip.id]);
    const third = await start(db),
      d3 = await register(db);
    await bind(db, third.trackingToken, d3);
    assert.notEqual(third.trip.id, first.trip.id);
    assert.equal((await proof(db, first.trackingToken, d3.deviceCredential)).authorized, true);
    const older = await time(db, "now()-interval '29 minutes'");
    assert.equal(
      (await ingest(db, first.trackingToken, d3.deviceCredential, 2, older)).accepted,
      true,
    );
    const fresh = await time(db, 'now()');
    assert.equal(
      (await ingest(db, third.trackingToken, d3.deviceCredential, 3, fresh)).stopTracking,
      false,
    );
    const rows = (
      await db.query(
        'select tracking_event_id,device_sequence,latitude,longitude,recorded_at::text,driver_trip_id from driver_trip_location_updates order by device_sequence',
      )
    ).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[0].tracking_event_id, id(101));
    assert.equal(rows[0].device_sequence, 1);
    assert.equal(rows[0].latitude, 53.5);
    assert.equal(rows[0].longitude, -113.5);
    assert.equal(Date.parse(rows[0].recorded_at), Date.parse(recorded));
    assert.equal(rows[0].driver_trip_id, first.trip.id);
    assert.equal(rows[2].driver_trip_id, third.trip.id);
  } finally {
    await db.close();
  }
});

test('revoked, expired, foreign-driver, foreign-authority and foreign-device sessions never authorize coordinates', async () => {
  const db = await installed();
  try {
    const { run, device } = await setup(db);
    const token = run.trackingToken,
      credential = device.deviceCredential;
    for (const [column, value] of [
      ['status', 'revoked'],
      ['driver_id', id(99)],
      ['tenant_id', id(90)],
      ['device_id', id(98)],
    ]) {
      await db.exec('begin');
      await db.query(
        `update bus_tracking_sessions set ${column}=$1 where session_token_hash=md5($2)`,
        [value, token],
      );
      assert.equal((await proof(db, token, credential)).authorized, false);
      await assert.rejects(
        ingest(db, token, credential, 1, await time(db, 'now()')),
        /session is not valid/,
      );
      await db.exec('rollback');
    }
    await db.query(
      "update bus_tracking_sessions set expires_at=now()-interval '25 hours' where session_token_hash=md5($1)",
      [token],
    );
    assert.equal((await proof(db, token, credential)).authorized, false);
    assert.deepEqual(await proof(db, 'invalid-token', credential), {
      authorized: false,
      protocolVersion: 1,
    });
    assert.equal(
      (await db.query('select count(*)::int as n from driver_trip_location_updates')).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test('another signed-in driver, authority or installation cannot reuse the original session', async () => {
  const db = await installed();
  try {
    const { run, device } = await setup(db);
    const otherPhone = await register(db, id(51));
    assert.equal(
      (await proof(db, run.trackingToken, otherPhone.deviceCredential)).authorized,
      false,
    );
    for (const [profile, driver, tenant, session, installation] of [
      [id(5), id(15), id(1), id(75), id(52)],
      [id(6), id(16), id(90), id(76), id(53)],
    ]) {
      await db.query(
        "insert into profiles(id,tenant_id,role,status) values($1,$2,'driver','active')",
        [profile, tenant],
      );
      await db.query(
        "insert into drivers(id,tenant_id,profile_id,status) values($1,$2,$3,'active')",
        [driver, tenant, profile],
      );
      await db.query("insert into auth.sessions values($1,$2,now()+interval '18 hours')", [
        session,
        profile,
      ]);
      await db.query(
        "select set_config('test.uid',$1,false),set_config('test.session_id',$2,false)",
        [profile, session],
      );
      const foreign = await register(db, installation);
      assert.equal(
        (await proof(db, run.trackingToken, foreign.deviceCredential)).authorized,
        false,
      );
      await assert.rejects(
        ingest(db, run.trackingToken, foreign.deviceCredential, 1, await time(db, 'now()')),
        /session is not valid/,
      );
    }
    assert.equal(
      (await db.query('select count(*)::int as n from driver_trip_location_updates')).rows[0].n,
      0,
    );
    assert.notEqual(device.deviceId, otherPhone.deviceId);
  } finally {
    await db.close();
  }
});

test('all non-driver roles are denied; active session, account/device status and enrolled MFA remain required', async () => {
  const db = await installed();
  try {
    const { run, device } = await setup(db);
    const check = () => proof(db, run.trackingToken, device.deviceCredential);
    for (const role of [
      'tenant_admin',
      'school_admin',
      'transportation_admin',
      'guardian',
      'platform_super_admin',
    ]) {
      await db.query('update profiles set role=$1 where id=$2', [role, id(3)]);
      await assert.rejects(check(), /active driver session/);
    }
    await db.query("update profiles set role='driver' where id=$1", [id(3)]);
    assert.equal((await check()).authorized, true); // No enrolled MFA, normal driver.
    await db.query("insert into auth.mfa_factors values($1,'verified')", [id(3)]);
    await assert.rejects(check(), /MFA required/);
    await db.exec("select set_config('test.aal','aal2',false)");
    assert.equal((await check()).authorized, true);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [
      id(70),
    ]);
    await assert.rejects(check(), /active driver session/);
    await db.query("update auth.sessions set not_after=now()+interval '18 hours' where id=$1", [
      id(70),
    ]);
    await db.query('insert into user_sessions values($1,$2,now())', [id(70), id(3)]);
    await assert.rejects(check(), /active driver session/);
    await db.exec('delete from user_sessions');
    for (const [table, column, target, value] of [
      ['profiles', 'status', id(3), 'suspended'],
      ['drivers', 'status', id(13), 'inactive'],
      ['tenants', 'status', id(1), 'suspended'],
      ['driver_tracking_devices', 'status', device.deviceId, 'revoked'],
    ]) {
      await db.exec('begin');
      await db.query(`update ${table} set ${column}=$1 where id=$2`, [value, target]);
      await assert.rejects(check(), /active driver session|device is not valid/);
      await db.exec('rollback');
    }
    const permissions = (
      await db.query(
        "select has_function_privilege('anon','public.authorize_driver_tracking_queue(text,text)','execute') as anon,has_function_privilege('service_role','public.authorize_driver_tracking_queue(text,text)','execute') as service,has_function_privilege('authenticated','public.authorize_driver_tracking_queue(text,text)','execute') as authenticated",
      )
    ).rows[0];
    assert.deepEqual(permissions, { anon: false, service: false, authenticated: true });
  } finally {
    await db.close();
  }
});

test('expired authorization boundaries reject new fixes while allowing bounded historical delivery', async () => {
  const db = await installed();
  try {
    const { run, device } = await setup(db);
    await db.query(
      "update bus_tracking_sessions set expires_at=now()-interval '10 minutes' where session_token_hash=md5($1)",
      [run.trackingToken],
    );
    const before = await time(db, "now()-interval '30 minutes'"),
      after = await time(db, "now()-interval '5 minutes'");
    assert.equal(
      (await ingest(db, run.trackingToken, device.deviceCredential, 1, before)).accepted,
      true,
    );
    const rejected = await ingest(db, run.trackingToken, device.deviceCredential, 2, after);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.stopTracking, true);
    assert.equal(rejected.rejectionReason, 'stale_fix');
  } finally {
    await db.close();
  }
});

test('protected rollout rehearses exact hosted definitions, ACLs and rollback without changing existing data', async () => {
  const db = await trackingQueueDb();
  try {
    const client = clientFor(db),
      config = await readConfig(),
      sql = await queueMigration();
    assert.equal(createHash('sha256').update(sql).digest('hex'), config.migrationSha256);
    const pending = JSON.parse(
      await fs.readFile(
        new URL('../../config/pending/tracking-queue-authorization.json', import.meta.url),
        'utf8',
      ),
    );
    const active = JSON.parse(
      await fs.readFile(
        new URL('../../config/authorization-surface.json', import.meta.url),
        'utf8',
      ),
    );
    assert.equal(pending.status, 'prepared-unapplied');
    assert.equal(pending.migration, config.migration);
    assert.deepEqual(pending.authenticated, ['authorize_driver_tracking_queue(text,text)']);
    assert.deepEqual(pending.serviceRole, []);
    assert.equal(active.authenticated.includes(pending.authenticated[0]), false);
    const before = await operationalSnapshot(client, config);
    verifyOperationalSnapshot(before, config, 'before');
    await rehearseOperational(client, sql, config);
    assert.deepEqual(await operationalSnapshot(client, config), before);
    await db.exec(sql);
    verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'after');
    await db.exec(operationalRestoreSql(before, config));
    assert.deepEqual(await operationalSnapshot(client, config), before);
    // A changed dependency must not be overwritten by the guarded migration.
    await db.exec(
      'create or replace function public.end_driver_trip(p_trip_id uuid) returns public.driver_trips language sql as $$select null::public.driver_trips$$',
    );
    await assert.rejects(db.exec(sql), /differs from reviewed hosted definition/);
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('public.authorize_driver_tracking_queue(text,text)') is null as absent",
        )
      ).rows[0].absent,
      true,
    );
    assert.equal((await queueBaseline()).readOnly, true);
  } finally {
    await db.close();
  }
});
