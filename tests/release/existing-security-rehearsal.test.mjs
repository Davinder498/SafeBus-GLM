import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  APPROVED_PROJECT,
  ACCEPTANCE_FILE,
  RECONCILIATION_FILE,
  CATALOG_SNAPSHOT_SQL,
  acceptanceWithinTransaction,
  runRollbackRehearsal,
  validateRehearsalTarget,
  assertPrivateApiSchemaHidden,
} from '../../scripts/lib/existing-security-rehearsal.mjs';

const validTarget = {
  environment: 'production',
  databaseUrl:
    'postgresql://postgres:password@db.' + APPROVED_PROJECT + '.supabase.co:5432/postgres',
  supabaseUrl: 'https://' + APPROVED_PROJECT + '.supabase.co',
  confirmation: 'REHEARSE_EXISTING_SECURITY_ROLLBACK_ONLY',
};

function fakeDatabase({ failure, drift = false } = {}) {
  const queries = [];
  let snapshots = 0;
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql === CATALOG_SNAPSHOT_SQL) {
        snapshots += 1;
        return { rows: [{ snapshot: { unchanged: !(drift && snapshots > 1) } }] };
      }
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
      if (sql === failure)
        throw Object.assign(new Error('provider detail must not be logged'), { code: '42501' });
      if (sql.includes("'PASS'")) return [{ rows: [] }, { rows: [{ result: 'PASS' }] }];
      return { rows: [] };
    },
  };
}

const acceptedSql = "begin transaction read only;\nselect 'PASS' as result;\nrollback;\n";
const input = { reconciliation: 'reconcile', security: 'security', acceptance: acceptedSql };

test('private schema boundary requires a real API rejection, not an invalid key or outage', async () => {
  const url = validTarget.supabaseUrl;
  await assertPrivateApiSchemaHidden(url, 'anon-test', async (requested, options) => {
    assert.equal(requested, url + '/rest/v1/');
    assert.equal(options.headers['Accept-Profile'], 'safebus_private');
    return { status: 406, json: async () => ({ code: 'PGRST106' }) };
  });
  for (const status of [200, 401, 403, 500]) {
    await assert.rejects(
      assertPrivateApiSchemaHidden(url, 'anon-test', async () => ({
        status,
        json: async () => ({ code: 'PGRST106' }),
      })),
      /could not be confirmed/,
    );
  }
  await assert.rejects(assertPrivateApiSchemaHidden(url, ''), /valid publishable/);
});

test('rehearsal accepts only the explicitly approved production project', () => {
  assert.equal(validateRehearsalTarget(validTarget).environment, 'production');
  assert.throws(
    () => validateRehearsalTarget({ ...validTarget, environment: 'development' }),
    /production-designated/,
  );
  assert.throws(
    () => validateRehearsalTarget({ ...validTarget, confirmation: 'DEPLOY_PRODUCTION' }),
    /rollback-only/,
  );
  const other = 'abcdefghijklmnopqrst';
  assert.throws(
    () =>
      validateRehearsalTarget({
        ...validTarget,
        supabaseUrl: 'https://' + other + '.supabase.co',
        databaseUrl: 'postgresql://postgres:password@db.' + other + '.supabase.co:5432/postgres',
      }),
    /not the approved/,
  );
});

test('successful rehearsal runs reconciliation before security and always rolls back', async () => {
  const client = fakeDatabase();
  const result = await runRollbackRehearsal(client, input);
  assert.equal(result.restored, true);
  assert.ok(client.queries.indexOf('reconcile') < client.queries.indexOf('security'));
  assert.equal(client.queries.filter((sql) => sql === 'rollback').length, 2);
  assert.equal(
    client.queries.some((sql) => /\bcommit\b/i.test(sql)),
    false,
  );
});

for (const failure of ['reconcile', 'security']) {
  test('failure during ' + failure + ' rolls back and returns no success evidence', async () => {
    const client = fakeDatabase({ failure });
    await assert.rejects(runRollbackRehearsal(client, input), (error) => {
      assert.equal(error.code, '42501');
      assert.doesNotMatch(error.message, /provider detail/);
      return /rolled back/.test(error.message);
    });
    assert.equal(client.queries.filter((sql) => sql === 'rollback').length, 2);
    assert.equal(client.queries.includes('commit'), false);
  });
}

test('missing PASS or a catalog change after rollback fails closed', async () => {
  const client = fakeDatabase();
  await assert.rejects(
    runRollbackRehearsal(client, {
      ...input,
      acceptance: 'begin transaction read only;\nselect 1;\nrollback;',
    }),
    /failed at acceptance/,
  );
  await assert.rejects(
    runRollbackRehearsal(fakeDatabase({ drift: true }), input),
    /Catalog changed/,
  );
});

test('acceptance transaction conversion preserves reviewed DO and role checks', async () => {
  const sql = await fs.readFile(ACCEPTANCE_FILE, 'utf8');
  const converted = acceptanceWithinTransaction(sql);
  assert.match(converted, /set local role authenticated/);
  assert.match(converted, /malformed session ID accepted/);
  assert.doesNotMatch(converted, /^begin transaction|^rollback;/im);
  assert.throws(
    () => acceptanceWithinTransaction(sql.replace('rollback;', 'commit;')),
    /envelope changed/,
  );
  assert.throws(
    () => acceptanceWithinTransaction(sql.replace('rollback;', 'commit;\nrollback;')),
    /Unexpected transaction/,
  );
});

test('snapshot-specific reconciliation retains the exact existing API signatures', async () => {
  const surface = JSON.parse(await fs.readFile('config/authorization-surface.json', 'utf8'));
  const migration = await fs.readFile(RECONCILIATION_FILE, 'utf8');
  const entries = [
    ...migration.matchAll(/\('([a-z0-9_]+\([^']*\))', '(authenticated|service_role)'\)/g),
  ];
  const expected = [...surface.authenticated, ...surface.serviceRole]
    .filter((signature) => signature !== 'get_admin_student_guardian_links(uuid)')
    .sort();
  assert.deepEqual(entries.map((entry) => entry[1]).sort(), expected);
  for (const [, signature, audience] of entries) {
    assert.ok(
      (audience === 'authenticated' ? surface.authenticated : surface.serviceRole).includes(
        signature,
      ),
    );
  }
  assert.match(migration, /Hosted authorization snapshot changed/);
  assert.match(migration, /write_audit_event_legacy/);
  assert.doesNotMatch(migration, /\b(?:drop function|drop table|delete from|update public\.)\b/i);
});

test('protected rehearsal refuses unmerged code before dependency or test execution', async () => {
  const workflow = await fs.readFile('.github/workflows/rehearse-existing-security.yml', 'utf8');
  const syntax = workflow.indexOf('Validate reviewed SHA syntax before checkout');
  const checkout = workflow.indexOf('actions/checkout@');
  const ancestry = workflow.indexOf('git merge-base --is-ancestor');
  const install = workflow.indexOf('pnpm install');
  assert.ok(syntax >= 0 && syntax < checkout);
  assert.ok(ancestry > checkout && ancestry < install);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-release/);
  assert.doesNotMatch(workflow, /deploy --prod|environment: (?:development|staging)/);
});

test('build validation cannot dirty or access credentials in the database checkout', async () => {
  const workflow = await fs.readFile('.github/workflows/rehearse-existing-security.yml', 'utf8');
  const [validation, rehearsal] = workflow
    .slice(workflow.indexOf('\n  validate:'))
    .split('\n  rehearse:');
  assert.ok(validation && rehearsal, 'validation and rehearsal must use separate jobs');
  assert.doesNotMatch(validation, /secrets\.|environment: production|SAFEBUS_DATABASE_URL/);
  for (const command of [
    'pnpm migrations:verify',
    'pnpm typecheck',
    'pnpm lint',
    'pnpm build',
    'pnpm test',
  ]) {
    assert.ok(validation.includes(command), 'validation must complete ' + command);
    assert.ok(!rehearsal.includes(command), 'database checkout must not run ' + command);
  }
  for (const job of [validation, rehearsal]) {
    assert.match(job, /actions\/checkout@[^\n]+\n\s+with:\n\s+ref: \$\{\{ inputs.git_ref \}\}/);
    assert.ok(job.indexOf('git merge-base --is-ancestor') < job.indexOf('pnpm install'));
  }
  assert.match(rehearsal, /needs: validate/);
  assert.match(rehearsal, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(rehearsal, /download-artifact|git (?:reset|restore|checkout --)/);
  const runner = await fs.readFile('scripts/rehearse-existing-security.mjs', 'utf8');
  assert.ok(
    runner.indexOf('Tracked files changed after checkout.') <
      runner.indexOf('await client.connect()'),
  );
  assert.match(runner, /'status', '--porcelain', '--untracked-files=no'/);
});
