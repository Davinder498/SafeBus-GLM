import fs from 'node:fs/promises';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { TARGET_REF } from './lib/capacity-bootstrap.mjs';
import { sha256 } from './lib/migrations.mjs';

const sqlPath = 'supabase/migrations/pending/20261117210433_recovery_runtime_security.sql';
const policyQuery =
  "select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname";
const hookQuery =
  "select setting from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'";
let client,
  connected = false,
  stage = 'preflight';
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'INSTALL_RECOVERY_RUNTIME_SECURITY'
  )
    throw Error('Protected workflow required');
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== '/postgres' ||
    (url.port || '5432') !== '5432' ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error('Session/direct postgres connection required');
  const binding = createEnvironmentBinding({
    environment: 'staging',
    databaseUrl: url.toString(),
    supabaseUrl: `https://${TARGET_REF}.supabase.co`,
  });
  client = verifiedDatabaseClient(
    url.toString(),
    process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
    'safebus-recovery-runtime',
  );
  await client.connect();
  connected = true;
  await assertEnvironmentIdentity(client, binding);
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw Error('Schema deployment busy');
  const sql = await fs.readFile(sqlPath, 'utf8');
  const expected = JSON.parse(
    await fs.readFile('tests/capacity/recovery-runtime-policies.json', 'utf8'),
  );
  const verify = async () => {
    const policies = (await client.query(policyQuery)).rows;
    if (JSON.stringify(policies) !== JSON.stringify(expected))
      throw Error('Policy catalog mismatch');
    const hooks = (await client.query(hookQuery)).rows;
    if (
      hooks.length !== 1 ||
      hooks[0].setting !== 'pgrst.db_pre_request=safebus_private.enforce_active_api_session'
    )
      throw Error('API hook mismatch');
    if (
      (
        await client.query(
          "select count(*)::integer as count from unnest(array['anon','authenticated','service_role']) r where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')",
        )
      ).rows[0].count !== 0
    )
      throw Error('Quarantine changed');
  };
  for (const mode of ['rehearse', 'install']) {
    stage = mode;
    await client.query('begin');
    await client.query(
      "set local statement_timeout='30s'; set local lock_timeout='2s'; set local idle_in_transaction_session_timeout='2min'",
    );
    stage = `${mode}-migration`;
    await client.query(sql);
    stage = `${mode}-catalog`;
    await verify();
    // Exercise current RLS and API hook using synthetic identities, then roll
    // back only the fixture savepoint so the surrounding schema transaction stays.
    let fixture = await fs.readFile('tests/capacity/recovery-role-rehearsal.sql', 'utf8');
    fixture = fixture
      .replace(/^begin;$/m, 'savepoint role_rehearsal;')
      .replace(/^rollback;$/m, 'rollback to savepoint role_rehearsal;');
    stage = `${mode}-role-rehearsal`;
    await client.query(fixture);
    stage = `${mode}-cleanup-verification`;
    await verify();
    stage = `${mode}-finish`;
    await client.query(mode === 'install' ? 'commit' : 'rollback');
    if (
      mode === 'rehearse' &&
      ((await client.query(policyQuery)).rows.length || (await client.query(hookQuery)).rows.length)
    )
      throw Error('Rehearsal rollback incomplete');
  }
  stage = 'post-commit';
  await client.query('begin transaction read only');
  await client.query('set local search_path=pg_catalog');
  await verify();
  await assertEnvironmentIdentity(client, binding);
  await client.query('rollback');
  await fs.mkdir('.safebus-release/capacity-runtime', { recursive: true });
  await fs.writeFile(
    '.safebus-release/capacity-runtime/evidence.json',
    JSON.stringify(
      {
        releaseSha: process.env.SAFEBUS_RELEASE_SHA,
        target: TARGET_REF,
        sqlSha256: sha256(sql),
        policies: 5,
        hookInstalled: true,
        quarantined: true,
        roleRehearsal: true,
        loginVerified: false,
        realtimeDeliveryVerified: false,
        capacityVerified: false,
      },
      null,
      2,
    ),
  );
  console.log('Recovery runtime security installed and verified; API access remains quarantined.');
} catch (error) {
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'UNKNOWN';
  console.error(`Recovery runtime security stopped at stage=${stage}; code=${code}`);
  process.exitCode = 1;
} finally {
  if (connected) {
    await client.query('rollback').catch(() => {});
    await client.end().catch(() => {});
  }
}
