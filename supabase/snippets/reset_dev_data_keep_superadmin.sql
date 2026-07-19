-- =============================================================================
-- SafeBus Alberta - DEV ONLY cleanup: wipe tenant data, keep platform super admin
-- =============================================================================
--
-- Purpose:
--   Hard-reset the hosted Supabase DEV project back to a "platform only" state
--   so a full end-to-end manual workflow test can start from scratch:
--     1. Super admin logs in
--     2. Super admin creates a tenant and invites the first tenant admin
--     3. Tenant admin onboards students, guardians, drivers, routes, stops, buses
--
-- What this script DOES:
--   - Deletes ALL business rows from every SafeBus public table that currently
--     exists in the database (missing tables are silently skipped).
--   - Deletes ALL non-superadmin auth.users rows (so emails can be re-used).
--   - Cascades those auth.users deletes into the matching public.profiles rows.
--
-- What this script PRESERVES:
--   - Every public.profiles row whose role = 'platform_super_admin'
--   - The matching auth.users rows for those super admins
--   - All schema, RLS policies, functions, triggers, types, and grants
--
-- Safety:
--   - Wrapped in a single transaction. Change the final `commit` to `rollback`
--     to dry-run without changing anything.
--   - Each table delete is guarded by to_regclass() so the script runs cleanly
--     even if some migrations (e.g. 0043 student_qr_credentials) have not yet
--     been applied to this DEV project.
--   - DEV ONLY. Do NOT run against staging or production.
--
-- Run from: Supabase Studio -> SQL Editor -> New query (service role context)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helper: conditionally delete every row from a table only if it exists.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  -- Order matters: children with ON DELETE RESTRICT go before their parents.
  -- The list below is the union of every SafeBus public.* table created by
  -- migrations 0001 -> 0044. Tables that are not present in this DEV project
  -- are silently skipped via the to_regclass() guard inside the loop.
  tables text[] := array[
    'student_bus_assignments',
    'bus_route_assignments',
    'driver_route_assignments',
    'student_trip_events',
    'driver_trip_location_updates',
    'driver_trip_current_locations',
    'driver_trips',
    'guardian_notification_outbox',
    'student_qr_credentials',
    'student_route_assignments',
    'student_guardians',
    'route_stops',
    'routes',
    'buses',
    'students',
    'guardians',
    'drivers',
    'tenant_onboarding_invitations',
    'schools',
    'tenants'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('delete from public.%I', t);
      raise notice 'Cleared public.%', t;
    else
      raise notice 'Skipped public.% (table does not exist)', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Snapshot the super admin profile ids BEFORE auth deletion.
-- We preserve them so their auth.users rows (and cascaded profiles rows)
-- survive the next step.
-- ---------------------------------------------------------------------------
create temp table _keep_super_admin_ids on commit drop as
  select id from public.profiles where role = 'platform_super_admin';

-- ---------------------------------------------------------------------------
-- Delete every auth.users row that is NOT a super admin.
-- Required so tenant admin / driver / guardian emails can be re-invited
-- cleanly during the manual test. Cascade removes their profiles rows.
-- ---------------------------------------------------------------------------
delete from auth.users
 where id not in (select id from _keep_super_admin_ids);

-- ---------------------------------------------------------------------------
-- Defensive sweep for orphaned non-superadmin profile rows (e.g. an auth.users
-- row was already deleted manually but the profile remained).
-- ---------------------------------------------------------------------------
delete from public.profiles
 where role <> 'platform_super_admin';

-- ---------------------------------------------------------------------------
-- Post-flight verification.
-- Every business table should report 0; profiles_remaining should equal the
-- number of platform_super_admin rows. A value of -1 means the table does not
-- exist in this DEV project (acceptable).
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.profiles)                                          as profiles_remaining,
  (select count(*) from public.profiles where role = 'platform_super_admin')      as superadmin_profiles,
  (select count(*) from auth.users)                                               as auth_users_remaining,
  (select count(*) from public.tenants)                                           as tenants_remaining,
  (select count(*) from public.schools)                                           as schools_remaining,
  (select case when to_regclass('public.students')                     is null then -1 else (select count(*) from public.students)                end) as students_remaining,
  (select case when to_regclass('public.guardians')                    is null then -1 else (select count(*) from public.guardians)               end) as guardians_remaining,
  (select case when to_regclass('public.drivers')                      is null then -1 else (select count(*) from public.drivers)                 end) as drivers_remaining,
  (select case when to_regclass('public.routes')                       is null then -1 else (select count(*) from public.routes)                  end) as routes_remaining,
  (select case when to_regclass('public.buses')                        is null then -1 else (select count(*) from public.buses)                   end) as buses_remaining,
  (select case when to_regclass('public.student_qr_credentials')       is null then -1 else (select count(*) from public.student_qr_credentials) end) as qr_credentials_remaining;

-- ---------------------------------------------------------------------------
-- To dry-run, change the next line to: rollback;
-- ---------------------------------------------------------------------------
commit;

-- =============================================================================
-- END
-- =============================================================================