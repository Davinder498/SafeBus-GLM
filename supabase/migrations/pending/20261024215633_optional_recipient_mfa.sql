create function safebus_private.has_completed_optional_mfa()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from public.profiles p
      join auth.mfa_factors f on f.user_id = p.id and f.status = 'verified'
      where p.id = auth.uid() and p.role in ('guardian', 'driver')
    )
  );
$$;
revoke all on function safebus_private.has_completed_optional_mfa() from public, anon;
grant execute on function safebus_private.has_completed_optional_mfa() to authenticated, service_role;

do $$
declare v_table record;
begin
  for v_table in
    select n.nspname, c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname in ('public', 'safebus_private')
           or (n.nspname = 'realtime' and c.relname = 'messages'))
      and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format(
      'create policy safebus_optional_mfa on %I.%I as restrictive for all to authenticated using ((select safebus_private.has_completed_optional_mfa())%s) with check ((select safebus_private.has_completed_optional_mfa()))',
      v_table.nspname, v_table.relname,
      case when v_table.nspname = 'public' and v_table.relname = 'profiles'
        then ' or id = (select auth.uid())' else '' end
    );
  end loop;
end;
$$;

create or replace function safebus_private.enforce_active_api_session()
returns void language plpgsql security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_path text := ltrim(current_setting('request.path', true), '/');
  v_method text := current_setting('request.method', true);
begin
  if auth.role() = 'service_role' then return; end if;
  if v_path = 'rpc/is_current_user_session_active'
     and v_method in ('GET', 'HEAD', 'POST') then return; end if;
  if not public.is_current_user_session_active() then
    raise exception 'An active SafeBus session is required.' using errcode = '42501';
  end if;
  if safebus_private.has_completed_optional_mfa() then return; end if;
  if v_path = 'profiles' and v_method in ('GET', 'HEAD') then return; end if;
  if v_path in ('rpc/register_current_user_session', 'rpc/record_own_auth_event')
     and v_method = 'POST' then return; end if;
  raise exception 'Complete multi-factor authentication to continue.' using errcode = '42501';
end;
$$;
revoke all on function safebus_private.enforce_active_api_session() from public, anon;
grant execute on function safebus_private.enforce_active_api_session() to authenticated, service_role;
