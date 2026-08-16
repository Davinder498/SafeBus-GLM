import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  assertDatabaseEnvironmentIdentity,
  createEnvironmentBinding,
} from '../../scripts/lib/environment-identity.mjs';
import {
  readCommittedManifest,
  readProductionAdoptionBaseline,
  resolveProductionAdoptionMigrations,
} from '../../scripts/lib/migrations.mjs';

const read = (file) => fs.readFile(file, 'utf8');
const projectRef = 'abcdefghijklmnopqrst';
const directDatabaseUrl = `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres`;
const poolerDatabaseUrl = `postgresql://postgres.${projectRef}:password@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;
const supabaseUrl = `https://${projectRef}.supabase.co`;

test('environment binding accepts matching direct and pooler Supabase targets', () => {
  const direct = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: directDatabaseUrl,
    supabaseUrl,
  });
  const pooler = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: poolerDatabaseUrl,
    supabaseUrl,
  });

  assert.equal(direct.environment, 'production');
  assert.equal(direct.projectRefHash, pooler.projectRefHash);
  assert.equal(direct.publicApiOriginHash, pooler.publicApiOriginHash);
  assert.equal(direct.databaseTarget, pooler.databaseTarget);
  for (const value of [direct.databaseTarget, direct.projectRefHash, direct.publicApiOriginHash]) {
    assert.match(value, /^[0-9a-f]{64}$/);
  }
});

test('environment binding refuses crossed database and API projects', () => {
  assert.throws(
    () =>
      createEnvironmentBinding({
        environment: 'production',
        databaseUrl: directDatabaseUrl,
        supabaseUrl: 'https://zyxwvutsrqponmlkjihg.supabase.co',
      }),
    /different projects/,
  );
});

test('database-side identity refuses a production database presented as development', async () => {
  const production = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: directDatabaseUrl,
    supabaseUrl,
  });
  const client = {
    async query(sql) {
      if (sql.includes('to_regclass')) {
        return { rowCount: 1, rows: [{ identity_table: 'safebus_release.environment_identity' }] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            environment: production.environment,
            database_target: production.databaseTarget,
          },
        ],
      };
    },
  };

  await assert.rejects(
    assertDatabaseEnvironmentIdentity(client, {
      environment: 'development',
      databaseUrl: directDatabaseUrl,
    }),
    /does not match/,
  );
});

test('production adoption gates precede the only database metadata write', async () => {
  const workflow = await read('.github/workflows/adopt-existing-production.yml');
  const checks = workflow.indexOf('Complete all adoption gates before database metadata changes');
  const adoption = workflow.indexOf('pnpm environment:adopt-production');

  assert.ok(checks >= 0 && checks < adoption);
  for (const gate of [
    'pnpm migrations:verify',
    'pnpm types:check',
    'pnpm typecheck',
    'pnpm lint',
    'pnpm test',
    'pnpm security:audit',
    'pnpm build',
    'pnpm test:smoke:release',
  ]) {
    assert.ok(workflow.indexOf(gate) > checks && workflow.indexOf(gate) < adoption);
  }
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /ADOPT_EXISTING_PRODUCTION/);
  assert.match(workflow, /BACKUP_VERIFIED/);
  assert.match(workflow, /FREE_PRELAUNCH_ONLY/);
  assert.match(workflow, /backup_evidence_reference/);
  assert.match(workflow, /CA_CENTRAL_1_VERIFIED/);
});

test('adoption records the existing schema without writing public application objects', async () => {
  const adoption = await read('scripts/adopt-existing-production.mjs');

  assert.match(adoption, /registerEnvironmentIdentity/);
  assert.match(adoption, /for \(const migration of adoptedMigrations\)/);
  assert.match(adoption, /resolveProductionAdoptionMigrations/);
  assert.match(adoption, /calculateSchemaFingerprint/);
  assert.doesNotMatch(adoption, /contractClient|contractBinding|promoted staging/);
  assert.match(adoption, /Production adoption found @example\.test QA identities/);
  assert.match(adoption, /backupEvidenceReferenceHash/);
  assert.match(adoption, /free-prelaunch-only/);
  assert.doesNotMatch(adoption, /(?:insert into|update|delete from|alter table)\s+public\./i);
  assert.doesNotMatch(adoption, /MIGRATION_DIRECTORY|fs\.readFile\([^)]*migration/i);
});

test('production adoption records only the immutable historical baseline', async () => {
  const manifest = await readCommittedManifest();
  const baseline = await readProductionAdoptionBaseline();
  const adopted = resolveProductionAdoptionMigrations(manifest, baseline);

  assert.equal(adopted.length, 89);
  assert.equal(adopted.at(-1)?.filename, '0088_fix_phase8_guardian_student_rls_recursion.sql');
  assert.equal(
    manifest.migrations.at(adopted.length)?.filename,
    '0089_authorization_surface_hardening.sql',
  );
  assert.ok(manifest.migrations.length - adopted.length >= 1);
  assert.ok(
    manifest.migrations
      .slice(adopted.length)
      .some((migration) => migration.filename === '0089_authorization_surface_hardening.sql'),
  );

  assert.throws(
    () =>
      resolveProductionAdoptionMigrations(manifest, {
        ...baseline,
        migrationsSha256: '0'.repeat(64),
      }),
    /differs from the reviewed migration snapshot/,
  );
});

test('every destructive database QA runner requires registered environment identity', async () => {
  for (const file of [
    'scripts/run-rls-tests.mjs',
    'scripts/seed-driver-event-qa-fixture.mjs',
    'scripts/seed-notification-qa-fixture.mjs',
    'scripts/seed-safe-eta-qa-fixture.mjs',
    'scripts/apply-safe-eta-scenario.mjs',
  ]) {
    assert.match(await read(file), /assertDatabaseEnvironmentIdentity/);
  }
  assert.match(
    await read('scripts/seed-student-qr-qa-fixture.mjs'),
    /sole hosted database is production/,
  );
});

test('database drift inspection requires registered environment identity', async () => {
  assert.match(
    await read('scripts/check-migration-drift.mjs'),
    /assertDatabaseEnvironmentIdentity/,
  );
});

test('single production database mode blocks schema-changing releases', async () => {
  const [preflight, deploy, ci] = await Promise.all([
    read('scripts/preflight-migrations.mjs'),
    read('scripts/deploy-migrations.mjs'),
    read('.github/workflows/ci.yml'),
  ]);

  assert.match(preflight, /Schema-changing releases are blocked/);
  assert.match(deploy, /Schema-changing releases are blocked/);
  assert.doesNotMatch(ci, /SAFEBUS_RLS_TEST_DATABASE_URL|RLS execution/);
  await assert.rejects(read('.github/workflows/release-staging.yml'), { code: 'ENOENT' });
  await assert.rejects(read('.github/workflows/register-development-environment.yml'), {
    code: 'ENOENT',
  });
});

test('schema fingerprints include authorization and SafeBus realtime controls', async () => {
  const fingerprint = await read('scripts/lib/schema-fingerprint.mjs');

  assert.match(fingerprint, /aclexplode\(coalesce\(p\.proacl/);
  assert.match(fingerprint, /aclexplode\(coalesce\(n\.nspacl/);
  assert.match(fingerprint, /join pg_enum/);
  assert.match(fingerprint, /safebus tracking broadcast receive/);
  assert.match(fingerprint, /table_schema = 'realtime'/);
});

test('Point 4 conversion decision is approved and recorded', async () => {
  const decisions = await read('docs/governance/decision-log.md');

  assert.match(decisions, /### DL-013 — Adopt the sole hosted database as production/);
  assert.match(decisions, /- Owner: Platform Administrator/);
  assert.match(decisions, /- Approved by: Platform Administrator/);
  assert.match(decisions, /- Status: Accepted and revised on 2026-08-15/);
  assert.match(decisions, /sole\s+Supabase database\s+and production system of record/);
  assert.match(decisions, /### DL-014 — Defer the paid Supabase tier during construction/);
  assert.match(decisions, /FREE_PRELAUNCH_ONLY/);
});
