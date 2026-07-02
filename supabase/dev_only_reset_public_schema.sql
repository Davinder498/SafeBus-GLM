-- SAFEbus Alberta DEV-ONLY PUBLIC SCHEMA RESET
--
-- DESTRUCTIVE SCRIPT.
--
-- Use only on a confirmed development/prototype Supabase project where all
-- public app tables and data may be deleted.
--
-- DO NOT RUN ON PRODUCTION.
-- DO NOT RUN IF YOU NEED TO KEEP ANY PUBLIC APP DATA.
-- BACK UP FIRST IF UNSURE.
--
-- This resets only the public schema. It does not manually delete Supabase
-- system schemas such as auth, storage, realtime, extensions, graphql, vault,
-- or internal Supabase schemas.
--
-- Manual-only usage:
-- 1. Confirm the target project is dev/prototype.
-- 2. Run this script manually in an approved SQL client.
-- 3. Apply only supabase/migrations/0001-0003 afterward.

begin;

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, service_role;

alter default privileges in schema public
  grant all on routines to postgres, service_role;

alter default privileges in schema public
  grant all on sequences to postgres, service_role;

notify pgrst, 'reload schema';

commit;
