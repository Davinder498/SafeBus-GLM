-- Phase 16A hosted-DEV regression checklist executable through guarded RLS runner.
-- Covers: admin own-tenant generation, cross-tenant denial, school/transportation
-- admin allowed policy path, Platform Super Admin/guardian/driver generation denial,
-- one active credential, rotation revocation, revoked/malformed token failure,
-- active-trip-only driver resolve, wrong route/tenant/inactive student/inactive
-- assignment denial, valid active trip success, duplicate event protection through
-- record_student_trip_event_for_active_trip(), pickup-before-drop-off enforcement,
-- guardian notification outbox enqueue, no browser SELECT on credential table,
-- and no raw token persistence. This file is intentionally fixture-agnostic and
-- should be extended with seeded DEV identities before manual hosted execution.
select has_table_privilege('authenticated', 'public.student_qr_credentials', 'select') = false as credential_table_not_browser_selectable;
select proname from pg_proc where proname in ('manage_student_qr_credential','resolve_student_qr_for_active_trip','get_admin_student_qr_credential_status');
