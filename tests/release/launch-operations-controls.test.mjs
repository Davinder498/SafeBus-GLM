import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CONTROL_KEYS,
  CONTROL_TARGET,
  productionValue,
  readControls,
  assertInactive,
  assertInitialCounts,
  setProductionControl,
} from '../../scripts/lib/launch-operations-controls.mjs';
const [retention, monitor] = CONTROL_KEYS;
const variable = (key, value) => ({
  key,
  is_secret: false,
  scopes: ['functions'],
  values: [
    { context: 'all', value },
    { context: 'deploy-preview', value: 'observe' },
  ],
});
function fixture() {
  const site = {
    id: CONTROL_TARGET.siteId,
    account_id: CONTROL_TARGET.accountId,
    name: 'bussafe',
    build_settings: {
      stop_builds: true,
      repo_branch: 'main',
      repo_url: 'https://github.com/Davinder498/SafeBus-GLM',
    },
    published_deploy: { id: 'previous', state: 'ready', context: 'production' },
  };
  const variables = [variable(monitor, 'observe')],
    shared = [],
    writes = [];
  const api = async (path, options = {}) => {
    if (options.method) {
      writes.push({ path, ...options });
      if (options.method === 'POST') variables.push(...structuredClone(options.body));
      else {
        const v = variables.find((v) => path.includes('/' + v.key + '?'));
        v.values = v.values.filter((v) => v.context !== 'production');
        v.values.push(structuredClone(options.body));
      }
      return {};
    }
    return structuredClone(
      path.startsWith('/sites/') ? site : path.includes('?site_id=') ? variables : shared,
    );
  };
  return { site, variables, shared, writes, api };
}
test('production override takes priority without changing previews', () => {
  assert.equal(productionValue(variable(monitor, 'observe')), 'observe');
  const v = variable(monitor, 'observe');
  v.values.push({ context: 'production', value: 'alert' });
  assert.equal(productionValue(v), 'alert');
  assert.equal(productionValue(null), null);
  for (const bad of [
    { ...v, is_secret: true },
    { ...v, values: [...v.values, { context: 'production', value: 'observe' }] },
  ])
    assert.throws(() => productionValue(bad));
});
test('target, shared controls and duplicate keys fail closed', async () => {
  for (const mutate of [
    (f) => (f.site.account_id = 'other'),
    (f) => (f.site.build_settings.stop_builds = false),
    (f) => (f.site.published_deploy.context = 'deploy-preview'),
    (f) => f.shared.push(variable(retention, 'true')),
    (f) => f.variables.push(variable(monitor, 'alert')),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(readControls(f.api));
    assert.equal(f.writes.length, 0);
  }
});
test('inactive baseline refuses a previous activation or live execution', async () => {
  const f = fixture(),
    hosting = await readControls(f.api),
    db = { destructive_enabled: false, approval_reference: null, approved_at: null };
  assert.doesNotThrow(() => assertInactive(hosting, db));
  for (const changed of [
    { destructive_enabled: true },
    { approval_reference: 'previous' },
    { approved_at: '2026-11-14' },
  ])
    assert.throws(() => assertInactive(hosting, { ...db, ...changed }));
  hosting.controls[retention] = variable(retention, 'true');
  assert.throws(() => assertInactive(hosting, db));
});
test('production writes preserve all-context and preview settings', async () => {
  const f = fixture(),
    before = await readControls(f.api),
    original = structuredClone(f.variables[0]);
  const after = await setProductionControl(f.api, monitor, 'alert', before);
  assert.equal(productionValue(after.controls[monitor]), 'alert');
  assert.deepEqual(
    after.controls[monitor].values.filter((v) => v.context !== 'production'),
    original.values,
  );
  assert.equal(f.writes[0].method, 'PATCH');
  assert.deepEqual(f.writes[0].body, { context: 'production', value: 'alert' });
});
test('missing retention control is created only for production without paid scope options', async () => {
  const f = fixture(),
    before = await readControls(f.api);
  await setProductionControl(f.api, retention, 'true', before);
  assert.deepEqual(f.writes[0].body, [
    { key: retention, values: [{ context: 'production', value: 'true' }], is_secret: false },
  ]);
});
test('concurrent changes and wrong control/value pairs never write', async () => {
  const f = fixture(),
    before = await readControls(f.api);
  f.variables[0].values[0].value = 'alert';
  await assert.rejects(setProductionControl(f.api, monitor, 'alert', before), /CONTROL_DRIFT/);
  for (const [key, value] of [
    [retention, 'alert'],
    [monitor, 'true'],
    ['OTHER', 'true'],
  ])
    await assert.rejects(setProductionControl(f.api, key, value, before), /CONTROL_SCOPE/);
  assert.equal(f.writes.length, 0);
});
test('unverified provider writes fail instead of claiming activation', async () => {
  const f = fixture(),
    before = await readControls(f.api);
  const api = (path, options) => (options?.method ? Promise.resolve({}) : f.api(path));
  await assert.rejects(setProductionControl(api, monitor, 'alert', before), /WRITE_UNVERIFIED/);
});
test('initial review refuses unreviewed record classes, oversized batches and account disposal', () => {
  const counts = Object.fromEntries(
    [
      'student_events',
      'exceptions',
      'statuses',
      'announcements',
      'email',
      'push',
      'inbox',
      'audience_failures',
      'push_devices',
      'cases',
      'invitations',
      'guardian_relationships',
      'student_records',
      'bus_tracking_sessions',
      'bus_run_dispatches',
      'trip_records',
      'driver_records',
      'guardian_records',
      'audit_records',
      'rate_limit_buckets',
      'user_sessions',
      'gps',
      'archive_manifests',
    ].map((k) => [k, 0]),
  );
  Object.assign(counts, { invitations: 2, bus_tracking_sessions: 11, rate_limit_buckets: 138 });
  assert.doesNotThrow(() => assertInitialCounts(counts, 0));
  for (const bad of [
    { ...counts, student_records: 1 },
    { ...counts, invitations: 501 },
    { ...counts, email: -1 },
    { ...counts, email: 0.5 },
    {},
  ])
    assert.throws(() => assertInitialCounts(bad, 0));
  assert.throws(() => assertInitialCounts(counts, 1));
});
test('protected workflow retains encrypted backup before activation and pauses after failure', async () => {
  const workflow = await fs.readFile('.github/workflows/release-engineering-artifact.yml', 'utf8');
  const capture = workflow.indexOf('run: node scripts/backup-existing-security.mjs');
  const retain = workflow.indexOf('name: Retain encrypted operational recovery before activation');
  const activate = workflow.indexOf('run: node scripts/release-launch-operations.mjs activate');
  const publish = workflow.indexOf('run: node scripts/release-engineering-artifact.mjs publish');
  const verify = workflow.indexOf('run: node scripts/release-launch-operations.mjs verify');
  assert.ok(
    capture > 0 && capture < retain && retain < activate && activate < publish && publish < verify,
  );
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /activate_operations:[\s\S]*?default: false/);
  assert.match(
    workflow,
    /inputs.operations_confirmation == 'ACTIVATE_REVIEWED_RETENTION_AND_ALERTS'/,
  );
  assert.match(workflow, /if: failure\(\) && inputs.activate_operations/);
  assert.match(workflow, /run: node scripts\/release-launch-operations.mjs pause/);
});

test('database activation commits once and rejects repeat activation without changing its approval', async (t) => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { activateDatabaseControl } =
    await import('../../scripts/lib/launch-operations-controls.mjs');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    'create table retention_execution_control(id int primary key,destructive_enabled boolean,approval_reference text,approved_at timestamptz);insert into retention_execution_control values(1,false,null,null)',
  );
  const client = {
    query: async (sql, params) => {
      if (sql.startsWith('set local')) {
        await db.exec(sql);
        return {};
      }
      const r = await db.query(sql, params);
      return { ...r, rowCount: r.affectedRows };
    },
  };
  await activateDatabaseControl(client, 'github:123:reviewed');
  const before = (await db.query('select * from retention_execution_control')).rows;
  assert.equal(before[0].destructive_enabled, true);
  assert.equal(before[0].approval_reference, 'github:123:reviewed');
  await assert.rejects(activateDatabaseControl(client, 'github:456:other'), /DATABASE_DRIFT/);
  assert.deepEqual((await db.query('select * from retention_execution_control')).rows, before);
  await db.query(
    'update retention_execution_control set destructive_enabled=false,approval_reference=null,approved_at=null',
  );
  const failingClient = {
    query: (sql, params) => {
      if (sql === 'commit') throw new Error('synthetic commit failure');
      return client.query(sql, params);
    },
  };
  await assert.rejects(
    activateDatabaseControl(failingClient, 'github:789:failure'),
    /synthetic commit failure/,
  );
  const rolledBack = (await db.query('select * from retention_execution_control')).rows[0];
  assert.equal(rolledBack.destructive_enabled, false);
  assert.equal(rolledBack.approval_reference, null);
});
