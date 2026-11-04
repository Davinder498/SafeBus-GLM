-- Exact inverse for the pinned pre-change default ACLs; future objects only.
-- Never grant privileges on existing application objects as recovery.
alter default privileges for role postgres grant execute on functions to public;
alter default privileges for role pg_database_owner grant execute on functions to public;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;
