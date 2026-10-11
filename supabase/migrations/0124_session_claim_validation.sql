-- Forward correction to 0122. Its outer SQL CASE does not protect casts inside
-- planned subqueries: malformed session IDs raised 22P02 during function startup.
-- Keep immutable 0122 unchanged and apply this correction before acceptance.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('public.is_current_user_session_active()') is null then
    raise exception 'Apply the reviewed session authorization baseline before migration 0124.';
  end if;
end;
$$;

create or replace function public.is_current_user_session_active()
returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_session_text text;
  v_session_id uuid;
begin
  -- Read claims once. Invalid JSON or a malformed subject also denies access;
  -- do not suppress permission, connection, or other database failures.
  begin
    v_user_id := auth.uid();
    v_session_text := auth.jwt() ->> 'session_id';
  exception when invalid_text_representation then
    return false;
  end;

  if v_user_id is null or v_session_text is null
     or v_session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  -- This is a separate procedural statement after validation, not a SQL CASE
  -- around a subquery. Queries receive a typed UUID, never unvalidated JWT text.
  v_session_id := v_session_text::uuid;

  return exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > statement_timestamp())
  ) and not exists (
    select 1 from public.user_sessions us
    where us.id = v_session_id and us.user_id = v_user_id
      and us.revoked_at is not null
  );
end;
$$;
revoke all on function public.is_current_user_session_active() from public, anon;
grant execute on function public.is_current_user_session_active() to authenticated, service_role;

notify pgrst, 'reload schema';
