#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import { agreementOrderRecoverySql } from './lib/agreement-order-recovery.mjs';
const hash = (x) => createHash('sha256').update(x).digest('hex');
const mode = process.argv[2];
const sha = process.env.SAFEBUS_RELEASE_SHA;
const directory = '.safebus-release/agreement-orders';
let client,
  stage = 'context',
  commitAttempted = false;
async function latest() {
  return (
    await client.query(
      "select release_sha,schema_fingerprint from safebus_release.releases where status='deployed' order by deployed_at desc limit 1",
    )
  ).rows[0];
}
async function empty() {
  const r = (
    await client.query(
      'select (select count(*) from safebus_private.agreement_catalog)::int catalogs,(select count(*) from safebus_private.agreement_packages)::int packages,(select count(*) from safebus_private.agreement_executed_artifacts)::int receipts',
    )
  ).rows[0];
  if (Object.values(r).some((v) => v !== 0)) throw Error('AGREEMENT_PUBLICATION_ALREADY_STARTED');
}
async function snapshot(config, phase) {
  const functions = [];
  for (const f of config.functions) {
    const r = (
      await client.query(
        "select md5(pg_get_functiondef(oid)) md5,pg_get_functiondef(oid) definition,pg_get_userbyid(proowner) owner,coalesce(proacl,acldefault('f',proowner))::text[] acl from pg_proc where oid=to_regprocedure($1)",
        [f.signature],
      )
    ).rows[0];
    if ((r?.md5 ?? null) !== f[phase] || (r && r.owner !== 'postgres'))
      throw Error('AGREEMENT_FUNCTION_DRIFT');
    functions.push({ signature: f.signature, ...r });
  }
  return functions;
}

try {
  assertReviewedCheckout(sha);
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify'].includes(mode)
  )
    throw Error('AGREEMENT_PROTECTED_CONTEXT');
  const config = JSON.parse(
    await fs.readFile('config/pending/agreement-order-snapshot.json', 'utf8'),
  );
  const sql = await fs.readFile(config.migration, 'utf8');
  if (hash(sql) !== config.migrationSha256 || config.projectId !== 'ckrkfylsyihwouvesypm')
    throw Error('AGREEMENT_SQL_IDENTITY');
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (binding.projectRefHash !== hash(config.projectId)) throw Error('AGREEMENT_PROJECT_IDENTITY');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-agreement-orders',
  );
  await client.connect();
  await assertEnvironmentIdentity(client, binding);
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) locked",
      )
    ).rows[0].locked
  )
    throw Error('AGREEMENT_DEPLOY_LOCK');
  await fs.mkdir(directory, { recursive: true });
  const identity = {
    releaseSha: sha,
    runId: process.env.GITHUB_RUN_ID,
    migrationSha256: config.migrationSha256,
  };
  const write = (name, value) =>
    fs.writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  if (mode === 'verify') {
    stage = 'verify';
    await snapshot(config, 'after');
    const registered = await latest();
    const current = await calculateSchemaFingerprint(client);
    if (registered.release_sha !== sha || registered.schema_fingerprint !== current)
      throw Error('AGREEMENT_LEDGER_MISMATCH');
    await write('verification', { ...identity, schemaFingerprint: current, verified: true });
  } else {
    stage = 'baseline';
    await empty();
    const before = await snapshot(config, 'before');
    const registered = await latest();
    const fingerprint = await calculateSchemaFingerprint(client);
    if (!registered || registered.schema_fingerprint !== fingerprint)
      throw Error('AGREEMENT_UNRELATED_SCHEMA_DRIFT');
    const recoverySql = agreementOrderRecoverySql(before);
    stage = 'rehearse';
    let afterFingerprint;
    await client.query('begin isolation level repeatable read');
    try {
      await client.query("set local lock_timeout='1s';set local statement_timeout='30s'");
      await client.query(sql);
      await snapshot(config, 'after');
      await empty();
      afterFingerprint = await calculateSchemaFingerprint(client);
      // Exercise the actual bounded recovery, then roll back everything.
      await client.query(recoverySql);
      await snapshot(config, 'before');
      if ((await calculateSchemaFingerprint(client)) !== fingerprint)
        throw Error('AGREEMENT_RECOVERY_MISMATCH');
    } finally {
      await client.query('rollback');
    }
    if ((await calculateSchemaFingerprint(client)) !== fingerprint)
      throw Error('AGREEMENT_REHEARSAL_CHANGED_SCHEMA');
    if (mode === 'prepare') {
      stage = 'recovery';
      const recovery = {
        ...identity,
        precedingRelease: registered,
        functions: before,
        restoreSql: recoverySql,
        note: 'Before publication only. Restore in one reviewed transaction, verify the preceding fingerprint, and remove only this release ledger row.',
      };
      const envelope = await encryptBackupStream(
        Readable.from([JSON.stringify(recovery)]),
        `${directory}/recovery.enc`,
        process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
      );
      await write('recovery', {
        ...identity,
        createdAt: new Date().toISOString(),
        beforeFingerprint: fingerprint,
        afterFingerprint,
        envelope,
      });
    } else {
      if (process.env.SAFEBUS_AGREEMENT_ORDER_CONFIRM !== 'INSTALL_AGREEMENT_ORDERS')
        throw Error('AGREEMENT_CONFIRMATION');
      const evidence = JSON.parse(await fs.readFile(`${directory}/recovery.json`, 'utf8'));
      const age = Date.now() - Date.parse(evidence.createdAt);
      if (
        Object.entries(identity).some(([k, v]) => evidence[k] !== v) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > 3600000 ||
        evidence.beforeFingerprint !== fingerprint ||
        evidence.afterFingerprint !== afterFingerprint ||
        evidence.envelope.ciphertextSha256 !== (await fileDigest(`${directory}/recovery.enc`))
      )
        throw Error('AGREEMENT_RECOVERY_EVIDENCE');
      stage = 'install';
      await client.query('begin isolation level repeatable read');
      try {
        await client.query("set local lock_timeout='1s';set local statement_timeout='30s'");
        await empty();
        await snapshot(config, 'before');
        if ((await calculateSchemaFingerprint(client)) !== fingerprint)
          throw Error('AGREEMENT_BASELINE_CHANGED');
        await client.query(sql);
        await snapshot(config, 'after');
        await empty();
        if ((await calculateSchemaFingerprint(client)) !== afterFingerprint)
          throw Error('AGREEMENT_POST_INSTALL_DRIFT');
        await client.query(
          "insert into safebus_release.releases(release_sha,environment,status,schema_fingerprint) values($1,'production','deployed',$2)",
          [sha, afterFingerprint],
        );
        commitAttempted = true;
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
      await write('installation', {
        ...identity,
        schemaFingerprint: afterFingerprint,
        installed: true,
        contractsPublished: false,
      });
    }
  }
  console.log(JSON.stringify({ result: 'passed', stage, mode }));
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code: commitAttempted
        ? 'AGREEMENT_COMMIT_REQUIRES_INSPECTION'
        : /^AGREEMENT_[A-Z_]+$/.test(error.message)
          ? error.message
          : 'AGREEMENT_ORDER_RELEASE_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
