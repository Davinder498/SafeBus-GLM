import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { baseline, migration, setup, ingest, time } from './fixtures/live-tracking-only-db.mjs';
import {
  hash,
  snapshotTrackingRemoval,
  rehearseTrackingRemoval,
  verifyRecoveryRun,
  trackingHistoryFootprint,
  retireGpsArchiveBucket,
  reviewedCatalogDigest,
  requireReviewedCatalog,
  registerTrackingSchemaRelease,
  verifyTrackingSchemaRelease,
} from '../../scripts/lib/live-tracking-removal.mjs';
import { operationalDataDigest } from '../../scripts/lib/operational-rollout.mjs';
const clientFor = (db) => ({
  query: async (sql, args) =>
    args ? db.query(sql, args) : ((await db.exec(sql)).at(-1) ?? { rows: [] }),
});
test('prepared release matches the reviewed function baseline, rehearses real SQL and rolls back every removal', async (t) => {
  const db = await baseline();
  t.after(() => db.close());
  const config = JSON.parse(await fs.readFile('config/pending/live-tracking-only.json', 'utf8'));
  const sql = await migration();
  assert.equal(hash(sql), config.migrationSha256);
  const client = clientFor(db),
    before = await snapshotTrackingRemoval(client, config);
  assert.deepEqual(before.functions, config.before.functions);
  // Old synthetic table layouts are minimal; function bodies and the new schema are exact.
  const local = { ...config, before };
  const { run, device } = await setup(db);
  await ingest(db, run.trackingToken, device.deviceCredential, 1, await time(db, '-10 minutes'));
  const footprint = await trackingHistoryFootprint(db, config.maxRemovalRows);
  assert.equal(footprint.rows, 1);
  await assert.rejects(trackingHistoryFootprint(db, 0), /RECOVERY_BOUND/);
  const result = await rehearseTrackingRemoval(client, sql, local, operationalDataDigest);
  assert.equal(result.rollbackVerified, true);
  assert.equal(result.notificationSent, false);
  assert.deepEqual(await trackingHistoryFootprint(db, config.maxRemovalRows), footprint);
  await ingest(db, run.trackingToken, device.deviceCredential, 2, await time(db, '-9 minutes'));
  assert.notEqual(
    (await trackingHistoryFootprint(db, config.maxRemovalRows)).digest,
    footprint.digest,
  );
});
test('destructive release requires a fresh successful exact-main encrypted recovery artifact', () => {
  const sha = 'a'.repeat(40),
    runId = '1234',
    now = Date.now();
  const run = {
    id: 1234,
    path: '.github/workflows/backup-platform-recovery.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(now - 1000).toISOString(),
  };
  const artifacts = [
    { name: 'platform-recovery-' + sha + '-' + runId, expired: false, size_in_bytes: 500 },
  ];
  const expected = { sha, runId, now };
  verifyRecoveryRun(run, artifacts, expected);
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' },
    { created_at: new Date(now - 86400001).toISOString() },
    { created_at: new Date(now + 1000).toISOString() },
  ])
    assert.throws(
      () => verifyRecoveryRun({ ...run, ...change }, artifacts, expected),
      /RECOVERY_INVALID/,
    );
  assert.throws(() => verifyRecoveryRun(run, [], expected), /RECOVERY_INVALID/);
  assert.throws(
    () => verifyRecoveryRun(run, [{ ...artifacts[0], expired: true }], expected),
    /RECOVERY_INVALID/,
  );
});

test('archive cleanup refuses objects and deletes only the empty retired bucket', async (t) => {
  const db = await baseline();
  t.after(() => db.close());
  const client = clientFor(db);
  await db.query(
    "insert into storage.buckets(id,name,public) values('retention-evidence','retention-evidence',false)",
  );
  await db.query(
    "insert into storage.objects(id,bucket_id) values(gen_random_uuid(),'retention-evidence')",
  );
  let calls = 0;
  const storage = {
    deleteBucket: async (id) => {
      assert.equal(id, 'retention-evidence');
      calls++;
      await db.query('delete from storage.buckets where id=$1', [id]);
      return { error: null };
    },
  };
  await assert.rejects(retireGpsArchiveBucket(client, storage), /NOT_EMPTY_PRIVATE/);
  assert.equal(calls, 0);
  await db.query("delete from storage.objects where bucket_id='retention-evidence'");
  assert.deepEqual(await retireGpsArchiveBucket(client, storage), {
    removed: true,
    objectsDeleted: 0,
  });
  assert.deepEqual(await retireGpsArchiveBucket(client, storage), {
    alreadyAbsent: true,
    objectsDeleted: 0,
  });
  assert.equal(calls, 1);
});

test('release refuses unrelated schema drift and registers its exact schema transactionally', async (t) => {
  const db = await baseline();
  t.after(() => db.close());
  const client = clientFor(db);
  await db.exec(`create schema safebus_release;
    create table safebus_release.releases(release_sha text primary key,environment text,status text,schema_fingerprint text)`);
  const beforeCatalogDigest = await reviewedCatalogDigest(client);
  assert.match(beforeCatalogDigest, /^[a-f0-9]{64}$/);
  await requireReviewedCatalog(client, { beforeCatalogDigest });
  await db.exec('begin;create table public.unreviewed_change(id int)');
  await assert.rejects(
    requireReviewedCatalog(client, { beforeCatalogDigest }),
    /UNREVIEWED_CATALOG/,
  );
  await db.exec('rollback');
  await requireReviewedCatalog(client, { beforeCatalogDigest });
  const sha = 'a'.repeat(40);
  await db.exec('begin');
  await db.exec(await migration());
  const fingerprint = await registerTrackingSchemaRelease(client, sha);
  assert.equal(await verifyTrackingSchemaRelease(client, sha), fingerprint);
  await db.exec('create table public.later_unreviewed_change(id int)');
  await assert.rejects(verifyTrackingSchemaRelease(client, sha), /REGISTERED_SCHEMA_DRIFT/);
  await db.exec('rollback');
  assert.deepEqual((await db.query('select * from safebus_release.releases')).rows, []);
  await requireReviewedCatalog(client, { beforeCatalogDigest });
});
