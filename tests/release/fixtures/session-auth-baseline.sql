-- Embedded PostgreSQL unit-test fixtures only; never execute against Supabase.
-- Minimum Auth contract used by the session guard, with synthetic UUIDs only.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema safebus_private;
grant usage on schema auth, safebus_private to authenticated, service_role;
create table auth.sessions (id uuid primary key, user_id uuid not null, not_after timestamptz);
create table public.user_sessions (id uuid primary key, user_id uuid not null, revoked_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim',true),''),
    nullif(current_setting('request.jwt.claims',true),''))::jsonb;
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role'));
$$;
