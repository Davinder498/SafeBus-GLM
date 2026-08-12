import { calculateSchemaFingerprint } from './schema-fingerprint.mjs';

export async function inspectSchemaDeployment(client, manifest) {
  const ledgerState = await client.query(`
    select
      to_regclass('safebus_release.migration_checksums') is not null as has_checksums,
      to_regclass('safebus_release.releases') is not null as has_releases,
      (select count(*)::integer
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')) as public_table_count
  `);
  const state = ledgerState.rows[0];
  if (state.has_checksums !== state.has_releases) {
    throw new Error('Release ledger is incomplete. Repair it through an approved forward process.');
  }
  if (!state.has_checksums) {
    if (Number(state.public_table_count) > 0) {
      throw new Error(
        'Refusing deploy: the populated database has no SafeBus release ledger. ' +
          'Adopt the existing schema through the approved environment-conversion process first.',
      );
    }
    return { initialized: false, applied: new Map(), pending: manifest.migrations };
  }

  const existingResult = await client.query(
    `select filename, checksum from safebus_release.migration_checksums order by filename`,
  );
  const applied = new Map(existingResult.rows.map((row) => [row.filename, row.checksum]));
  const expected = new Map(manifest.migrations.map((migration) => [migration.filename, migration]));

  let encounteredPending = false;
  for (const migration of manifest.migrations) {
    if (!applied.has(migration.filename)) {
      encounteredPending = true;
      continue;
    }
    if (encounteredPending) {
      throw new Error(`Refusing deploy: migration ledger has a gap before ${migration.filename}.`);
    }
    if (applied.get(migration.filename) !== migration.sha256) {
      throw new Error(`Refusing deploy: checksum drift in ${migration.filename}.`);
    }
  }
  for (const filename of applied.keys()) {
    if (!expected.has(filename)) {
      throw new Error(`Refusing deploy: database has unknown migration ${filename}.`);
    }
  }

  const lastRelease = await client.query(
    `select schema_fingerprint from safebus_release.releases
      where status = 'deployed' order by deployed_at desc limit 1`,
  );
  if (applied.size > 0 && lastRelease.rowCount !== 1) {
    throw new Error('Refusing deploy: tracked migrations exist without a release fingerprint.');
  }
  if (lastRelease.rowCount === 1) {
    const currentFingerprint = await calculateSchemaFingerprint(client);
    if (currentFingerprint !== lastRelease.rows[0].schema_fingerprint) {
      throw new Error('Refusing deploy: out-of-band public schema drift was detected.');
    }
  }

  return {
    initialized: true,
    applied,
    pending: manifest.migrations.filter((migration) => !applied.has(migration.filename)),
  };
}
