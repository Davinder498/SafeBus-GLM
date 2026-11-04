-- Future objects only. Existing object grants, RLS, identities and data stay intact.
-- Managed supabase_admin defaults require a separately coordinated provider repair.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role pg_database_owner
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
