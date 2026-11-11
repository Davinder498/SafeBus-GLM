import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { trackingReleaseFixture } from './fixtures/async-tracking-release-db.mjs';
import {
  collectSchemaCatalog,
  calculateSchemaFingerprint,
} from '../../scripts/lib/schema-fingerprint.mjs';
import {
  operationalSnapshot,
  operationalRestoreSql,
} from '../../scripts/lib/operational-rollout.mjs';
import {
  trackingCatalogDelta,
  precedingTrackingCatalog,
  verifyTrackingLineage,
  requireTrackingLedger,
  registerTrackingHistoryRelease,
  trackingHistoryRecoverySql,
} from '../../scripts/lib/tracking-release-lineage.mjs';

const proof = JSON.parse(
  await fs.readFile('config/observed/tracking-release-lineage-20261111.json', 'utf8'),
);
const config = JSON.parse(
  await fs.readFile('config/pending/tracking-history-cleanup.json', 'utf8'),
);
const initialSql = await fs.readFile(
  'supabase/migrations/pending/0125_async_tracking_invalidations.sql',
  'utf8',
);
const cleanupSql = await fs.readFile(config.migration, 'utf8');
const sha = 'a'.repeat(40);

async function fixture(t) {
  const db = await trackingReleaseFixture(t);
  // PGlite uses PG18, while the reviewed hosted target is PG17. PG18 added
  // standalone NOT NULL constraint rows; PG17 represents these in pg_attribute.
  // Keep the production collector unchanged and model PG17 in this fixture only.
  const client = {
    query: async (sql, params) => {
      const result = await db.query(sql, params);
      if (sql.includes('from pg_constraint con join pg_class c'))
        result.rows = result.rows.filter((r) => !r.definition.startsWith('NOT NULL '));
      return result;
    },
  };
  const before = await collectSchemaCatalog(client);
  const local = { ...proof, precedingFingerprint: await calculateSchemaFingerprint(client) };
  await db.exec(`create schema safebus_release; create table safebus_release.releases(
    release_sha text primary key, environment text, status text, schema_fingerprint text,
    deployed_at timestamptz default clock_timestamp());`);
  await db.query(
    "insert into safebus_release.releases values($1,'production','deployed',$2,now()-interval '1 day')",
    [proof.precedingReleaseSha, local.precedingFingerprint],
  );
  await db.exec(initialSql);
  return { db, client, before, local };
}

test('reviewed PG17 deltas reproduce the exact original catalog including CRLF without changing the database', async (t) => {
  const { db, client, before, local } = await fixture(t);
  const installed = await collectSchemaCatalog(client);
  assert.deepEqual(trackingCatalogDelta(before, installed), proof.initial);
  assert.deepEqual(precedingTrackingCatalog(installed, proof.initial), before);
  await requireTrackingLedger(client, local, 'initial');
  assert.deepEqual(await collectSchemaCatalog(client), installed);
  await db.exec(cleanupSql);
  const repaired = await collectSchemaCatalog(client);
  assert.deepEqual(trackingCatalogDelta(before, repaired), proof.cleanup);
  await verifyTrackingLineage(client, local, 'cleanup');
  const wrongLineEndings = structuredClone(local);
  wrongLineEndings.cleanup.routines.removed[0].definition =
    wrongLineEndings.cleanup.routines.removed[0].definition.replaceAll('\r', '');
  await assert.rejects(
    verifyTrackingLineage(client, wrongLineEndings, 'cleanup'),
    /UNRELATED_DRIFT/,
  );
});

test('lineage rejects extra queue grants, indexes, policies, unrelated drift and changed reviewed functions', async (t) => {
  const { db, client, local } = await fixture(t);
  for (const sql of [
    'grant select on safebus_private.tracking_invalidation_queue to authenticated',
    'create index unexpected_queue_index on safebus_private.tracking_invalidation_queue(tenant_id)',
    'create policy unexpected on safebus_private.tracking_invalidation_queue using(true)',
    'alter table public.tenants add column unexpected text',
    'alter function safebus_private.notify_tracking_location_change() set search_path=public',
  ]) {
    await db.exec('begin');
    try {
      await db.exec(sql);
      await assert.rejects(verifyTrackingLineage(client, local, 'initial'), /OPERATIONAL_LINEAGE_/);
    } finally {
      await db.exec('rollback');
    }
  }
  await requireTrackingLedger(client, local, 'initial');
});

test('repair and ledger registration roll back together; scoped recovery preserves the original ledger', async (t) => {
  const { db, client, local } = await fixture(t);
  const snapshot = await operationalSnapshot(db, config);
  await db.exec('begin');
  await requireTrackingLedger(client, local, 'initial');
  await db.exec(cleanupSql);
  await registerTrackingHistoryRelease(client, local, sha);
  await requireTrackingLedger(client, local, 'cleanup');
  await db.exec('rollback');
  await requireTrackingLedger(client, local, 'initial');
  assert.equal(
    (await db.query('select count(*)::int n from safebus_release.releases')).rows[0].n,
    1,
  );
  await db.exec(cleanupSql);
  const fingerprint = await registerTrackingHistoryRelease(client, local, sha);
  const restore = trackingHistoryRecoverySql(
    operationalRestoreSql(snapshot, config),
    sha,
    fingerprint,
  );
  await db.exec('begin');
  await db.exec(restore);
  await requireTrackingLedger(client, local, 'initial');
  await db.exec('rollback');
  await db.query(
    "insert into safebus_release.releases values($1,'production','deployed',$2,now()+interval '1 day')",
    ['b'.repeat(40), fingerprint],
  );
  await assert.rejects(requireTrackingLedger(client, local, 'initial'), /LINEAGE_/);
  await assert.rejects(db.exec(restore), /Later or different deployment/);
  assert.equal(
    (await db.query('select count(*)::int n from safebus_release.releases')).rows[0].n,
    3,
  );
});
