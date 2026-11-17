import { createEnvironmentBinding } from './environment-identity.mjs';
import { sha256 } from './migrations.mjs';

export const SOURCE_REF = 'ckrkfylsyihwouvesypm';
export const TARGET_REF = 'deladookciebwvqojhkv';
export const SOURCE_FINGERPRINT =
  '502e5769df192afe246c8c5d793839efd66052311a9555e5f7c904fc01d82857';
export const EXTENSIONS = [
  ['postgis', 'extensions', '3.3.7'],
  ['btree_gist', 'extensions', '1.7'],
  ['pg_cron', 'pg_catalog', '1.6.4'],
  ['pg_net', 'extensions', '0.20.4'],
];

export function bootstrapBindings(sourceUrl, targetUrl) {
  for (const value of [sourceUrl, targetUrl]) {
    const url = new URL(value);
    if (url.pathname !== '/postgres' || (url.port || '5432') !== '5432' || url.search || url.hash)
      throw new Error('Use a query-free direct/session postgres URL on port 5432.');
    if (!url.password) throw new Error('Database credential is missing.');
  }
  return {
    source: createEnvironmentBinding({
      environment: 'production',
      databaseUrl: sourceUrl,
      supabaseUrl: `https://${SOURCE_REF}.supabase.co`,
    }),
    target: createEnvironmentBinding({
      environment: 'staging',
      databaseUrl: targetUrl,
      supabaseUrl: `https://${TARGET_REF}.supabase.co`,
    }),
  };
}

// No provider schemas, role changes, current sequence values, data, jobs or secrets
// are in the archive. A source-owned function body remains code, not an invocation.
export function schemaDumpArgs(snapshot) {
  if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-\d+$/.test(snapshot)) throw new Error('Invalid snapshot.');
  return [
    '--schema-only',
    '--format=plain',
    '--no-owner',
    '--no-comments',
    '--no-security-labels',
    '--no-publications',
    '--no-subscriptions',
    '--schema=public',
    '--schema=safebus_private',
    '--lock-wait-timeout=2s',
    '--snapshot=' + snapshot,
  ];
}

export function normalizeDump(sql) {
  if (typeof sql !== 'string' || sql.length < 1000 || sql.length > 20_000_000)
    throw new Error('Unexpected schema archive size.');
  // Native pg_dump 17 emits only these two psql guards. Reject any other meta
  // command instead of passing it to PostgreSQL or enabling arbitrary psql input.
  let dollarTag = null;
  const result = sql
    .split('\n')
    .filter((line) => {
      // pg_dump function bodies are dollar quoted. Never rewrite their contents.
      if (dollarTag) {
        if (line.includes(dollarTag)) dollarTag = null;
        return true;
      }
      const body = line.match(/^\s+AS (\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/);
      if (body && !line.slice(line.indexOf(body[1]) + body[1].length).includes(body[1])) {
        dollarTag = body[1];
        return true;
      }
      // This provider-owned baseline is verified equal before import and again
      // by the full defaultGrants catalog afterward. postgres cannot alter it.
      if (
        /^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON (TABLES|SEQUENCES|FUNCTIONS) TO (postgres|anon|authenticated|service_role);$/.test(
          line,
        )
      )
        return false;
      if (/^\\(?:un)?restrict [A-Za-z0-9]+\s*$/.test(line)) return false;
      if (/^\\/.test(line)) throw new Error('Unexpected archive meta-command.');
      return (
        line !== 'CREATE SCHEMA public;' &&
        !/^SET (statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = 0;$/.test(
          line,
        )
      );
    })
    .join('\n');
  if (!result.includes('CREATE TABLE ') || !result.includes('CREATE FUNCTION '))
    throw new Error('Application schema missing from archive.');
  return result;
}

const appSections = [
  'columns',
  'relations',
  'constraints',
  'indexes',
  'policies',
  'routines',
  'routineGrants',
  'relationGrants',
  'columnGrants',
  'triggers',
  'schemas',
  'types',
  'typeGrants',
  'sequences',
  'eventTriggers',
  'defaultGrants',
];
export function appCatalog(catalog) {
  return Object.fromEntries(
    appSections.map((name) => {
      if (!Array.isArray(catalog[name])) throw new Error('Missing catalog section: ' + name);
      return [
        name,
        catalog[name].filter((row) =>
          ['public', 'safebus_private'].includes(
            row.schema_name ?? row.schemaname ?? row.nspname ?? row.function_schema,
          ),
        ),
      ];
    }),
  );
}
export function assertAppCatalog(source, target, quarantined = false) {
  const expected = appCatalog(source),
    actual = appCatalog(target);
  if (quarantined)
    expected.schemas = expected.schemas.filter(
      (row) =>
        !(
          row.privilege_type === 'USAGE' &&
          ['PUBLIC', 'anon', 'authenticated', 'service_role'].includes(row.grantee)
        ),
    );
  for (const section of appSections)
    if (JSON.stringify(expected[section]) !== JSON.stringify(actual[section]))
      throw new Error('Application catalog differs: ' + section);
  return sha256(JSON.stringify(expected));
}

export const EMPTY_TARGET_SQL = `select
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','safebus_private','safebus_release') and c.relkind in ('r','p','v','m','S')) as relations,
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','safebus_private','safebus_release')) as routines,
  (select count(*)::integer from auth.users) as users,
  (select count(*)::integer from storage.objects) as objects,
  (select count(*)::integer from storage.buckets) as buckets,
  (select count(*)::integer from vault.secrets) as secrets`;
export function assertEmptyTarget(row) {
  if (
    !row ||
    !['relations', 'routines', 'users', 'objects', 'buckets', 'secrets'].every(
      (key) => row[key] === 0,
    )
  )
    throw new Error('Target is not empty; never reset or overwrite it.');
}

export function assertManagedDefaults(source, target) {
  const rows = (catalog) =>
    appCatalog(catalog).defaultGrants.filter((row) => row.owner !== 'postgres');
  if (JSON.stringify(rows(source)) !== JSON.stringify(rows(target)))
    throw new Error('Managed default privileges differ; provider review required.');
}

// Fresh Supabase projects grant these roles defaults that the production app
// has narrowed. Remove inherited defaults before creating objects; the dump
// restores postgres-owned defaults and explicit object ACLs inside the transaction.
export const RESET_TARGET_DEFAULTS_SQL = ['TABLES', 'SEQUENCES', 'FUNCTIONS']
  .map(
    (kind) =>
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${kind} FROM anon, authenticated, service_role;`,
  )
  .join('\n');
