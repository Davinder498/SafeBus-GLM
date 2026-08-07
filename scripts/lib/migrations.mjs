import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MIGRATION_DIRECTORY = 'supabase/migrations';
export const MANIFEST_PATH = 'supabase/migration-checksums.json';

const ALLOWED_VERSION_COLLISIONS = new Map([
  ['0058', new Set(['0058_admin_trip_overview.sql', '0058_unified_bus_management_workspace.sql'])],
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function buildMigrationManifest(root = process.cwd()) {
  const directory = path.join(root, MIGRATION_DIRECTORY);
  const filenames = (await fs.readdir(directory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (filenames.length === 0) throw new Error('No canonical migrations were found.');

  const byVersion = new Map();
  const migrations = [];

  for (const filename of filenames) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(filename);
    if (!match) throw new Error(`Invalid canonical migration filename: ${filename}`);

    const version = match[1];
    const filesForVersion = byVersion.get(version) ?? [];
    filesForVersion.push(filename);
    byVersion.set(version, filesForVersion);

    const contents = await fs.readFile(path.join(directory, filename));
    migrations.push({
      version,
      filename,
      bytes: contents.byteLength,
      sha256: sha256(contents),
    });
  }

  for (const [version, versionFiles] of byVersion) {
    if (versionFiles.length === 1) continue;

    const allowed = ALLOWED_VERSION_COLLISIONS.get(version);
    const actual = new Set(versionFiles);
    if (
      !allowed ||
      allowed.size !== actual.size ||
      [...actual].some((filename) => !allowed.has(filename))
    ) {
      throw new Error(
        `Duplicate migration version ${version}: ${versionFiles.join(', ')}. ` +
          'Only the documented immutable 0058 collision is allowed.',
      );
    }
  }

  const versions = [...byVersion.keys()].map(Number).sort((a, b) => a - b);
  for (let expected = versions[0]; expected <= versions.at(-1); expected += 1) {
    if (!byVersion.has(String(expected).padStart(4, '0'))) {
      throw new Error(`Missing migration version ${String(expected).padStart(4, '0')}.`);
    }
  }

  return {
    format: 1,
    algorithm: 'sha256',
    migrationDirectory: MIGRATION_DIRECTORY,
    migrations,
  };
}

export async function readCommittedManifest(root = process.cwd()) {
  const raw = await fs.readFile(path.join(root, MANIFEST_PATH), 'utf8');
  return JSON.parse(raw);
}

export function stableManifestJson(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
