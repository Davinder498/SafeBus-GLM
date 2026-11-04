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
drop policy safebus_active_session on safebus_private.authority_announcements;
drop policy safebus_active_session on safebus_private.authority_directory_import_state;
drop policy safebus_active_session on safebus_private.authority_reference_directory;
drop policy safebus_active_session on safebus_private.billing_catalog_operations;
drop policy safebus_active_session on safebus_private.bus_qr_prints;
drop policy safebus_active_session on safebus_private.notification_audience_queue;
drop policy safebus_active_session on safebus_private.notification_dispatch_counters;
drop policy safebus_active_session on safebus_private.student_qr_prints;
drop policy safebus_active_session on safebus_private.tenant_billing_control;
drop policy safebus_active_session on safebus_private.tenant_subscription_exemptions;
