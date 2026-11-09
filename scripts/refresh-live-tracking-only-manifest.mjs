// Prepare expected after-state using embedded PostgreSQL. Never edits the reviewed hosted before-state.
import fs from 'node:fs/promises';
import {
  baseline,
  migration,
  migrationPath,
} from '../tests/release/fixtures/live-tracking-only-db.mjs';
import { hash, snapshotTrackingRemoval } from './lib/live-tracking-removal.mjs';
const file = 'config/pending/live-tracking-only.json';
const config = JSON.parse(await fs.readFile(file, 'utf8'));
const db = await baseline();
try {
  for (const f of config.before.functions.filter((f) => f.md5 !== null)) {
    const existing = (
      await db.query(
        "select md5(replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'')) md5",
        [f.signature],
      )
    ).rows[0];
    if (existing.md5 !== f.md5)
      throw new Error('Reviewed hosted function baseline differs: ' + f.signature);
    await db.exec(
      'revoke all on function ' + f.signature + ' from public,anon,authenticated,service_role',
    );
    for (const role of ['anon', 'authenticated', 'service_role'])
      if (f.acl.some((a) => a.startsWith(role + '=X/')))
        await db.exec('grant execute on function ' + f.signature + ' to ' + role);
  }
  await db.exec('begin');
  const sql = await migration();
  await db.exec(sql);
  config.after = await snapshotTrackingRemoval(db, config);
  config.migrationSha256 = hash(sql);
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n');
  console.log(
    JSON.stringify({
      prepared: true,
      migration: migrationPath,
      functions: config.functions.length,
      hostedWrites: false,
    }),
  );
} finally {
  await db.close();
}
