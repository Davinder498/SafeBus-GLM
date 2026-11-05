// Refresh only prepared after-state metadata from the owned in-memory fixture.
// This cannot inspect or modify a hosted database, or change the reviewed before state.
import fs from 'node:fs/promises';
import { fixture, migrationPath } from '../tests/release/fixtures/retention-lifecycle-schema.mjs';
import {
  operationalSnapshot,
  operationalDigest,
  verifyOperationalSnapshot,
} from './lib/operational-rollout.mjs';
const path = 'config/pending/retention-lifecycle.json';
const config = JSON.parse(await fs.readFile(path, 'utf8'));
const before = await fixture(false);
try {
  verifyOperationalSnapshot(await operationalSnapshot(before, config), config, 'before');
} finally {
  await before.close();
}
const after = await fixture();
try {
  const snapshot = await operationalSnapshot(after, config);
  for (const [i, f] of config.functions.entries()) {
    if (
      snapshot.functions[i].owner !== f.owner ||
      JSON.stringify(snapshot.functions[i].acl) !== JSON.stringify(f.acl)
    )
      throw new Error('Reviewed function ownership/grants changed');
    f.after = { md5: snapshot.functions[i].md5 };
  }
  for (const key of ['relations', 'columns', 'triggers', 'indexes', 'storageBuckets'])
    config[key].forEach((entry, i) => (entry.after = snapshot[key][i]));
  config.policies.forEach((entry, i) => (entry.after = snapshot.policies[i]));
  config.migrationSha256 = operationalDigest(await fs.readFile(migrationPath, 'utf8'));
  await fs.writeFile(path, JSON.stringify(config, null, 2) + '\n');
} finally {
  await after.close();
}
