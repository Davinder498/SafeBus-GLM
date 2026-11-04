import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { queuedTripFixture, ids } from './fixtures/queued-trip-stop-fixture.mjs';
const signature = 'public.apply_driver_trip_stop_action(uuid,text,timestamp with time zone,text)';
const revision = '2026-11-03T14:00:00Z';
test('durable stop replay retains atomic revision, ownership and authorization guards', async (t) => {
  const db = await queuedTripFixture();
  t.after(() => db.close());
  const config = JSON.parse(await fs.readFile('config/pending/offline-trip-actions.json', 'utf8'));
  const sql = await fs.readFile(config.migration, 'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'), config.migrationSha256);
  await t.test('rehearses installation and rollback without persistent changes', async () => {
    await db.exec('begin');
    await db.exec(sql);
    const {
      rows: [row],
    } = await db.query(
      "select md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) as md5",
      [signature],
    );
    assert.equal(row.md5, config.functions.find((f) => f.signature === signature).after.md5);
    await db.exec('rollback');
    assert.equal(
      (await db.query('select to_regprocedure($1) as fn', [signature])).rows[0].fn,
      null,
    );
  });
  await db.exec(sql);
  const run = async (action, expected = revision, reason = null) =>
    (
      await db.query('select public.apply_driver_trip_stop_action($1,$2,$3,$4) as outcome', [
        ids.trip,
        action,
        expected,
        reason,
      ])
    ).rows[0].outcome;
  const isolated = async (fn) => {
    await db.exec('begin');
    try {
      await fn();
    } finally {
      await db.exec('rollback');
    }
  };
  await t.test(
    'applies each authorized action once and treats repeated completion as inert',
    async () => {
      for (const action of ['pause', 'end', 'cancel'])
        await isolated(async () => {
          assert.equal(await run(action), 'applied');
          assert.equal(await run(action), action === 'pause' ? 'confirmed' : 'obsolete');
          assert.deepEqual((await db.query('select action from public.fixture_events')).rows, [
            { action },
          ]);
        });
    },
  );
  await t.test('changed revisions return review without any status mutation or event', () =>
    isolated(async () => {
      await db.exec("update public.driver_trips set updated_at='2026-11-03T15:00:00Z'");
      assert.equal(await run('end'), 'review');
      assert.equal(
        (await db.query('select status from public.driver_trips')).rows[0].status,
        'active',
      );
      assert.equal(
        (await db.query('select count(*)::int as n from public.fixture_events')).rows[0].n,
        0,
      );
    }),
  );
  await t.test(
    'denies all non-driver roles, invalid sessions and incomplete enrolled MFA',
    async () => {
      for (const role of [
        'guardian',
        'tenant_admin',
        'school_admin',
        'transportation_admin',
        'platform_super_admin',
      ])
        await isolated(async () => {
          await db.query("select set_config('test.role',$1,true)", [role]);
          await assert.rejects(run('end'), /active driver sign-in/);
        });
      for (const key of ['test.session', 'test.mfa'])
        await isolated(async () => {
          await db.query('select set_config($1,$2,true)', [key, 'false']);
          await assert.rejects(run('end'), /active driver sign-in/);
        });
    },
  );
  await t.test('denies foreign ownership, authority and disabled account entities', async () => {
    for (const key of ['test.uid', 'test.tenant', 'test.driver'])
      await isolated(async () => {
        await db.query('select set_config($1,$2,true)', [
          key,
          '55555555-5555-4555-8555-555555555555',
        ]);
        await assert.rejects(run('end'), /not available/);
      });
    for (const table of ['tenants', 'profiles', 'drivers'])
      await isolated(async () => {
        await db.exec(`update public.${table} set status='disabled'`);
        await assert.rejects(run('end'), /not available/);
      });
  });
  await t.test(
    'preserves operational-detail validation and rejects resume/invalid inputs',
    async () => {
      await isolated(() =>
        assert.rejects(run('cancel', revision, 'student name'), /prohibited detail/),
      );
      await isolated(() => assert.rejects(run('resume'), /valid saved trip action/));
      await isolated(() => assert.rejects(run('end', null), /valid saved trip action/));
    },
  );
  await t.test(
    'grants only authenticated execution and holds the row lock through mutation',
    async () => {
      const {
        rows: [privileges],
      } = await db.query(
        `select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('service_role',$1,'execute') as service,has_function_privilege('authenticated',$1,'execute') as authenticated`,
        [signature],
      );
      assert.deepEqual(privileges, { anon: false, service: false, authenticated: true });
      const definition = (
        await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])
      ).rows[0].definition;
      assert.ok(
        definition.indexOf('for update of dt') <
          definition.indexOf('v_trip.updated_at is distinct'),
      );
      assert.ok(
        definition.indexOf('v_trip.updated_at is distinct') <
          definition.indexOf('perform public.pause_driver_trip'),
      );
      await isolated(async () => {
        await db.exec('set local role authenticated');
        assert.equal(await run('pause'), 'applied');
      });
    },
  );
  await t.test('refuses to overwrite an existing endpoint', () =>
    isolated(() => assert.rejects(db.exec(sql), /already exists/)),
  );
});
