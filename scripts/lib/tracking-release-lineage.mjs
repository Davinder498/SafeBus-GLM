import { isDeepStrictEqual } from 'node:util';
import { collectSchemaCatalog } from './schema-fingerprint.mjs';
import { operationalDigest } from './operational-rollout.mjs';

// These are the ORDER BY keys in schema-fingerprint.mjs. Only sections changed
// by the reviewed tracking migrations may be reconstructed. All other catalog
// entries, including unexpected grants and triggers, remain in the comparison.
const order = {
  columns: ['schema_name', 'relation_name', 'ordinal_position'],
  relations: ['schema_name', 'relname'],
  constraints: ['schema_name', 'relname', 'conname'],
  indexes: ['schema_name', 'relation_name', 'index_name'],
  routines: ['schema_name', 'proname', 'arguments'],
  routineGrants: ['schema_name', 'proname', 'arguments', 'grantor', 'grantee', 'privilege_type'],
  relationGrants: ['schema_name', 'relname', 'grantor', 'grantee', 'privilege_type'],
  types: ['schema_name', 'typname'],
  typeGrants: ['schema_name', 'typname', 'grantor', 'grantee', 'privilege_type'],
};

export function trackingCatalogDelta(before, after) {
  const delta = {};
  for (const key of Object.keys(before.catalog)) {
    const removed = before.catalog[key].filter(
      (r) => !after.catalog[key].some((a) => isDeepStrictEqual(r, a)),
    );
    const added = after.catalog[key].filter(
      (r) => !before.catalog[key].some((b) => isDeepStrictEqual(r, b)),
    );
    if (removed.length || added.length) {
      if (!order[key]) throw new Error('OPERATIONAL_LINEAGE_UNSUPPORTED_SECTION');
      delta[key] = { removed, added };
    }
  }
  return delta;
}

export function precedingTrackingCatalog(current, delta) {
  const previous = structuredClone(current);
  for (const [section, change] of Object.entries(delta)) {
    if (!order[section]) throw new Error('OPERATIONAL_LINEAGE_UNSUPPORTED_SECTION');
    for (const added of change.added) {
      const matches = previous.catalog[section].filter((r) => isDeepStrictEqual(r, added));
      if (matches.length !== 1) throw new Error('OPERATIONAL_LINEAGE_CHANGED_OBJECT');
      previous.catalog[section] = previous.catalog[section].filter(
        (r) => !isDeepStrictEqual(r, added),
      );
    }
    for (const removed of change.removed) {
      if (previous.catalog[section].some((r) => isDeepStrictEqual(r, removed)))
        throw new Error('OPERATIONAL_LINEAGE_DUPLICATE_OBJECT');
      previous.catalog[section].push(removed);
    }
    previous.catalog[section].sort((a, b) => {
      for (const key of order[section]) {
        if (a[key] < b[key]) return -1;
        if (a[key] > b[key]) return 1;
      }
      return 0;
    });
  }
  return previous;
}

export async function verifyTrackingLineage(client, proof, phase) {
  const catalog = await collectSchemaCatalog(client);
  const previous = precedingTrackingCatalog(catalog, proof[phase]);
  if (operationalDigest(JSON.stringify(previous)) !== proof.precedingFingerprint)
    throw new Error('OPERATIONAL_LINEAGE_UNRELATED_DRIFT');
  const { rows } = await client.query(
    "select schema_fingerprint from safebus_release.releases where release_sha=$1 and environment='production' and status='deployed'",
    [proof.precedingReleaseSha],
  );
  if (rows.length !== 1 || rows[0].schema_fingerprint !== proof.precedingFingerprint)
    throw new Error('OPERATIONAL_LINEAGE_RELEASE_MISMATCH');
  return operationalDigest(JSON.stringify(catalog));
}

export async function requireTrackingLedger(client, proof, phase) {
  const fingerprint = await verifyTrackingLineage(client, proof, phase);
  const { rows } = await client.query(
    "select release_sha,schema_fingerprint from safebus_release.releases where status='deployed' order by deployed_at desc limit 1",
  );
  if (
    rows.length !== 1 ||
    (phase === 'initial'
      ? rows[0].release_sha !== proof.precedingReleaseSha ||
        rows[0].schema_fingerprint !== proof.precedingFingerprint
      : rows[0].schema_fingerprint !== fingerprint)
  )
    throw new Error('OPERATIONAL_LINEAGE_LATEST_RELEASE_MISMATCH');
  return fingerprint;
}

export async function registerTrackingHistoryRelease(client, proof, releaseSha) {
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new Error('OPERATIONAL_LINEAGE_RELEASE_SHA');
  const fingerprint = await verifyTrackingLineage(client, proof, 'cleanup');
  await client.query(
    "insert into safebus_release.releases(release_sha,environment,status,schema_fingerprint) values($1,'production','deployed',$2)",
    [releaseSha, fingerprint],
  );
  return fingerprint;
}

export function trackingHistoryRecoverySql(restoreSql, releaseSha, fingerprint) {
  if (!/^[a-f0-9]{40}$/.test(releaseSha) || !/^[a-f0-9]{64}$/.test(fingerprint ?? ''))
    throw new Error('OPERATIONAL_LINEAGE_RECOVERY_IDENTITY');
  // Executed only as part of an operator's reviewed rollback transaction. Never
  // remove a later deployment or an entry with a different registered schema.
  return `DO $lineage$ BEGIN
    IF (
      NOT EXISTS (SELECT 1 FROM safebus_release.releases WHERE release_sha='${releaseSha}' AND environment='production' AND status='deployed' AND schema_fingerprint='${fingerprint}') OR
      (SELECT release_sha FROM safebus_release.releases WHERE status='deployed' ORDER BY deployed_at DESC LIMIT 1) IS DISTINCT FROM '${releaseSha}'
    ) THEN RAISE EXCEPTION 'Later or different deployment prevents recovery.'; END IF;
  END $lineage$;\n${restoreSql}\nDELETE FROM safebus_release.releases WHERE release_sha='${releaseSha}' AND environment='production' AND status='deployed' AND schema_fingerprint='${fingerprint}';`;
}
