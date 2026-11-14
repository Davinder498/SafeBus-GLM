import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CONTROL_KEYS,
  CONTROL_TARGET,
  PAUSED_ACTIVATION,
  restorePausedMonitor,
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
        if (options.method === 'PUT') {
          v.values = structuredClone(options.body.values)
            .reverse()
            .map((value, i) => ({ ...value, id: `new-${i}`, role: '' }));
          return {};
        }
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
test('all-context writes explicitly preserve all five contexts despite regenerated metadata', async () => {
  const f = fixture(),
    before = await readControls(f.api);
  const after = await setProductionControl(f.api, monitor, 'alert', before);
  assert.equal(productionValue(after.controls[monitor]), 'alert');
  assert.deepEqual(
    Object.fromEntries(after.controls[monitor].values.map((v) => [v.context, v.value])),
    {
      'dev-server': 'observe',
      dev: 'observe',
      'branch-deploy': 'observe',
      'deploy-preview': 'observe',
      production: 'alert',
    },
  );
  assert.equal(f.writes[0].method, 'PUT');
  assert.equal('scopes' in f.writes[0].body, false);
});
test('explicit custom branches and preview overrides survive production changes', async () => {
  const f = fixture();
  f.variables[0].values.push({ context: 'branch', context_parameter: 'special', value: 'off' });
  f.variables[0].values.find((v) => v.context === 'deploy-preview').value = 'off';
  const after = await setProductionControl(f.api, monitor, 'alert', await readControls(f.api));
  assert.equal(after.controls[monitor].values.find((v) => v.context === 'branch').value, 'off');
  assert.equal(
    after.controls[monitor].values.find((v) => v.context === 'deploy-preview').value,
    'off',
  );
});
test('provider context loss, scope changes and value changes still fail closed', async () => {
  for (const change of [
    (v) => {
      v.values = v.values.filter((x) => x.context !== 'dev-server');
    },
    (v) => {
      v.scopes = ['builds'];
    },
    (v) => {
      v.values.find((x) => x.context === 'dev').value = 'alert';
    },
  ]) {
    const f = fixture(),
      before = await readControls(f.api);
    const api = async (path, options) => {
      const result = await f.api(path, options);
      if (options?.method) change(f.variables[0]);
      return result;
    };
    await assert.rejects(setProductionControl(api, monitor, 'alert', before), /CONTEXT_CHANGED/);
  }
});
function pausedFixture() {
  const f = fixture();
  f.variables[0].values = [
    { context: 'production', value: 'alert' },
    { context: 'dev', value: 'observe' },
    { context: 'branch-deploy', value: 'observe' },
    { context: 'deploy-preview', value: 'observe' },
  ];
  f.variables.push({
    ...variable(retention, 'false'),
    values: [{ context: 'production', value: 'false' }],
  });
  return f;
}
const pausedControl = {
  destructive_enabled: false,
  approval_reference: PAUSED_ACTIVATION.reference,
  approved_at: PAUSED_ACTIVATION.approvedAt,
};
test('only the inspected paused run with no executions can resume and repair its missing context', async () => {
  const f = pausedFixture(),
    before = await readControls(f.api);
  assertInactive(before, pausedControl, 0);
  assert.throws(() => assertInactive(before, pausedControl, 1), /PAUSED_DATABASE_BASELINE/);
  for (const changed of [
    { destructive_enabled: true },
    { approval_reference: 'other' },
    { approved_at: '2026-11-13' },
  ])
    assert.throws(() => assertInactive(before, { ...pausedControl, ...changed }, 0));
  const after = await restorePausedMonitor(f.api, before);
  assertInactive(after, pausedControl, 0);
  assert.equal(
    after.controls[monitor].values.find((v) => v.context === 'dev-server').value,
    'observe',
  );
  await restorePausedMonitor(f.api, after);
  assert.equal(f.writes.length, 1);
  f.variables[0].values.find((v) => v.context === 'dev').value = 'alert';
  await assert.rejects(
    restorePausedMonitor(f.api, await readControls(f.api)),
    /PAUSED_HOSTING_BASELINE/,
  );
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

test('paused database approval is replaced atomically only with exact prior timestamp and no executions', async (t) => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { activateDatabaseControl } =
    await import('../../scripts/lib/launch-operations-controls.mjs');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    'create schema safebus_private; create table safebus_private.retention_lifecycle_totals(id int); create table retention_execution_control(id int primary key,destructive_enabled boolean,approval_reference text,approved_at timestamptz)',
  );
  await db.query('insert into retention_execution_control values(1,false,$1,$2)', [
    pausedControl.approval_reference,
    pausedControl.approved_at,
  ]);
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
  await db.exec('insert into safebus_private.retention_lifecycle_totals values(1)');
  await assert.rejects(
    activateDatabaseControl(client, 'new', pausedControl),
    /PAUSED_DATABASE_BASELINE/,
  );
  await db.exec('delete from safebus_private.retention_lifecycle_totals');
  await assert.rejects(
    activateDatabaseControl(client, 'new', {
      ...pausedControl,
      approved_at: '2026-11-14T11:29:37.160449+00:00',
    }),
    /PAUSED_DATABASE_BASELINE/,
  );
  await activateDatabaseControl(client, 'new', pausedControl);
  assert.equal(
    (await db.query('select approval_reference from retention_execution_control')).rows[0]
      .approval_reference,
    'new',
  );
  await assert.rejects(activateDatabaseControl(client, 'again', pausedControl), /DATABASE_DRIFT/);
});
