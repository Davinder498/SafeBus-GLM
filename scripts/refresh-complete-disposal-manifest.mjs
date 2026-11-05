// Capture exact prepared definitions from the owned Postgres fixture. Never connects to production.
import fs from 'node:fs/promises';
import { fixture, migrationPath } from '../tests/release/fixtures/complete-disposal-schema.mjs';
import {
  operationalDigest,
  operationalSnapshot,
  verifyOperationalSnapshot,
} from './lib/operational-rollout.mjs';
const prefix = 'config/pending/complete-disposal.json';
const sql = await fs.readFile(migrationPath, 'utf8');
const before = await fixture(false);
const after = await fixture();
const spec = {
  projectId: 'ckrkfylsyihwouvesypm',
  migration: migrationPath,
  migrationSha256: operationalDigest(sql),
  rehearseRestore: true,
  functions: [],
  relations: [],
  policies: [],
  defaults: [],
  repairs: [],
  triggers: [],
  indexes: [],
};
try {
  const functions = (
    await after.query(
      `select p.oid::regprocedure::text signature,n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='safebus_private' and p.proname like 'disposal_%') or (n.nspname='public' and p.proname in ('manage_disposal','manage_retention_case','disposal_account_work','run_retention_lifecycle')) order by n.nspname,p.proname`,
    )
  ).rows;
  // Identity arguments include names; format_type/oidvectortypes produces the
  // exact canonical signature accepted by to_regprocedure and recovery SQL.
  for (const f of functions) {
    const {
      rows: [row],
    } = await after.query(
      `select oidvectortypes(proargtypes) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2`,
      [f.schema, f.proname],
    );
    spec.functions.push({
      signature: `${f.schema}.${f.proname}(${row.types.replaceAll(', ', ',')})`,
      before: { md5: null },
      after: { md5: null },
    });
  }
  const rel = (
    await after.query(
      `select 'safebus_private.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='safebus_private' and c.relkind='r' and c.relname like 'disposal_%' order by name`,
    )
  ).rows;
  spec.relations = rel.map((r) => ({ name: r.name, before: null, after: {} }));
  spec.newTables = rel.map((r) => r.name);
  spec.mustBeEmptyBeforeRestore = [...spec.newTables, 'safebus_private.retention_lifecycle_totals'];
  const triggers = (
    await after.query(
      `select n.nspname||'.'||c.relname as "table",t.tgname as name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and t.tgname in ('complete_disposal_guard','disposal_account_guard','disposal_setup_lock') order by 1,2`,
    )
  ).rows;
  spec.triggers = triggers.map((t) => ({ ...t, before: null, after: '' }));
  spec.indexes = [...sql.matchAll(/^CREATE INDEX (disposal_\w+) ON public\./gm)].map((m) => ({
    schema: 'public',
    name: m[1],
    before: null,
    after: '',
  }));
  const b = await operationalSnapshot(before, spec),
    a = await operationalSnapshot(after, spec);
  for (const [i, f] of spec.functions.entries())
    Object.assign(f, {
      owner: a.functions[i].owner,
      acl: a.functions[i].acl,
      before: { md5: b.functions[i].md5 },
      after: { md5: a.functions[i].md5 },
    });
  for (const key of ['relations', 'triggers', 'indexes'])
    spec[key].forEach((e, i) => {
      e.before = b[key][i];
      e.after = a[key][i];
    });
  verifyOperationalSnapshot(b, spec, 'before');
  verifyOperationalSnapshot(a, spec, 'after');
  await fs.writeFile(prefix, JSON.stringify(spec, null, 2) + '\n');
} finally {
  await before.close();
  await after.close();
}
