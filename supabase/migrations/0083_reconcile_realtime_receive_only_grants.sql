-- SafeBus Alberta - keep browser realtime access receive-only
--
-- PostgreSQL privileges granted to PUBLIC are inherited by anon and
-- authenticated. Revoking INSERT only from authenticated therefore does not
-- prevent browser publication when the hosted Realtime schema has a PUBLIC
-- INSERT grant. Remove that inherited path without changing the private SELECT
-- policy or the explicit privileges held by Supabase's server-side roles.

revoke insert on table realtime.messages from public, anon, authenticated;

grant select on table realtime.messages to authenticated;

comment on policy "safebus tracking broadcast receive" on realtime.messages is
  'Receive-only private tracking invalidations. Browser roles cannot publish; exact guardian-user and tenant-admin topics are authorized server-side.';
