import { sha256 } from './migrations.mjs';

const CATALOG_QUERIES = [
  `select table_name, column_name, ordinal_position, data_type, udt_schema, udt_name,
          is_nullable, column_default, identity_generation, generation_expression
     from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position`,
  `select c.relname as relation_name, c.relkind, c.relrowsecurity, c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','S')
    order by c.relname`,
  `select c.relname as relation_name, con.conname,
          pg_get_constraintdef(con.oid, true) as definition
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    order by c.relname, con.conname`,
  `select tablename, indexname, indexdef
     from pg_indexes where schemaname = 'public'
    order by tablename, indexname`,
  `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     from pg_policies where schemaname = 'public'
    order by tablename, policyname`,
  `select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
          pg_get_functiondef(p.oid) as definition
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, arguments`,
  `select c.relname as relation_name, t.tgname,
          pg_get_triggerdef(t.oid, true) as definition
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
    order by c.relname, t.tgname`,
  `select grantee, table_name, privilege_type
     from information_schema.role_table_grants
    where table_schema = 'public'
    order by table_name, grantee, privilege_type`,
];

export async function calculateSchemaFingerprint(client) {
  const catalog = [];
  for (const query of CATALOG_QUERIES) {
    const result = await client.query(query);
    catalog.push(result.rows);
  }

  return sha256(JSON.stringify(catalog));
}
