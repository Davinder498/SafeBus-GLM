-- Restrict authenticated access in addition to existing grants, RLS and MFA guards.
-- No permissive policies or client grants are added.
create policy safebus_active_session on safebus_private.authority_announcements
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.authority_directory_import_state
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.authority_reference_directory
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.billing_catalog_operations
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.bus_qr_prints
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.notification_audience_queue
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.notification_dispatch_counters
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.student_qr_prints
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.tenant_billing_control
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
create policy safebus_active_session on safebus_private.tenant_subscription_exemptions
  as restrictive for all to authenticated
  using ((select public.is_current_user_session_active()))
  with check ((select public.is_current_user_session_active()));
