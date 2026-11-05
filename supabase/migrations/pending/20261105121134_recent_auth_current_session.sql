-- Preserve the existing private API, owner and ACL. No data or policy writes.
-- Another device's sign-in and refresh activity must not renew this session.
create or replace function safebus_private.has_recent_authentication()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp
as $function$
begin
  -- Validates subject/session UUID and checks the live Auth row, expiry and
  -- application revocation. Keep the cast in a later procedural statement.
  if not public.is_current_user_session_active() then
    return false;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = (auth.jwt() ->> 'session_id')::uuid
      and s.user_id = auth.uid()
      and s.created_at >= statement_timestamp() - make_interval(secs => safebus_private.recent_auth_window_seconds())
      and s.created_at <= statement_timestamp()
  );
end;
$function$;
