-- Commercial security milestone, forward-only. Generated with Supabase CLI,
-- renamed to the repository's required contiguous four-digit version format.
-- Apply only after a validated 0089+ baseline via the protected release flow.
-- This does NOT reconcile an unadopted production schema or authorize deployment.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('safebus_private.current_user_role()') is null
     or to_regprocedure('safebus_private.current_tenant_id()') is null
     or to_regprocedure('safebus_private.bus_service_entities_in_tenant(uuid,uuid,uuid)') is null
     or to_regprocedure('public.current_user_role()') is not null
     or to_regprocedure('public.bus_service_entities_in_tenant(uuid,uuid,uuid)') is not null then
    raise exception 'Reconcile and validate the authorization baseline before migration 0122.';
  end if;
end;
$$;

-- S3: Access JWTs outlive logout/revocation. Check the real Auth session as well
-- as the mirror; missing, expired and malformed sessions deny access. Account
-- activation keeps a real Auth session; role helpers still require active profiles.
create or replace function public.is_current_user_session_active()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select case
    when auth.uid() is null
      or coalesce(auth.jwt() ->> 'session_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then false
    else exists (
      select 1 from auth.sessions s
      where s.id = (auth.jwt() ->> 'session_id')::uuid
        and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > statement_timestamp())
    ) and not exists (
      select 1 from public.user_sessions us
      where us.id = (auth.jwt() ->> 'session_id')::uuid
        and us.user_id = auth.uid() and us.revoked_at is not null
    )
  end;
$$;
revoke all on function public.is_current_user_session_active() from public, anon;
grant execute on function public.is_current_user_session_active() to authenticated, service_role;

create or replace function safebus_private.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p.role from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.status = 'active'
    and (p.role = 'platform_super_admin' or t.status = 'active')
    and public.is_current_user_session_active()
  limit 1;
$$;
create or replace function safebus_private.current_tenant_id()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p.tenant_id from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.id = auth.uid() and p.status = 'active' and public.is_current_user_session_active()
  limit 1;
$$;
create or replace function safebus_private.current_school_id()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p.school_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active' and public.is_current_user_session_active()
  limit 1;
$$;
create or replace function safebus_private.current_profile_id()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() where public.is_current_user_session_active();
$$;

-- AND every existing permissive policy with a session check. Do not grant any
-- new table operations; service workers keep their existing BYPASSRLS behavior.
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
      'create policy safebus_active_session on %I.%I as restrictive for all to authenticated using ((select public.is_current_user_session_active())) with check ((select public.is_current_user_session_active()))',
      v_table.nspname, v_table.relname
    );
  end loop;
end;
$$;

-- PostgREST pre-request protects SECURITY DEFINER RPCs, which bypass RLS.
-- This does not run on Realtime/Storage; the policies/helpers above are needed.
create or replace function safebus_private.enforce_active_api_session()
returns void
language plpgsql security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return; end if;
  -- Permit only the caller's boolean session-status RPC after revocation so
  -- clients can distinguish logout from an outage. The path is set by PostgREST,
  -- not a caller-provided header. No other RPC/data endpoint is exempted.
  if ltrim(current_setting('request.path', true), '/') = 'rpc/is_current_user_session_active'
     and current_setting('request.method', true) in ('GET', 'HEAD', 'POST') then
    return;
  end if;
  if not public.is_current_user_session_active() then
    raise exception 'An active SafeBus session is required.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function safebus_private.enforce_active_api_session() from public, anon;
grant execute on function safebus_private.enforce_active_api_session() to authenticated, service_role;

-- Do not silently replace an existing hook (including database-scoped settings).
do $$
begin
  if exists (
    select 1 from pg_db_role_setting s,
      lateral unnest(s.setconfig) c(setting)
    where s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
      and s.setrole in (0, (select oid from pg_roles where rolname = 'authenticator'),
        (select oid from pg_roles where rolname = 'authenticated'),
        (select oid from pg_roles where rolname = 'anon'),
        (select oid from pg_roles where rolname = 'service_role'))
      and c.setting like 'pgrst.db_pre_request=%'
      and c.setting <> 'pgrst.db_pre_request=safebus_private.enforce_active_api_session'
      and not (c.setting = 'pgrst.db_pre_request=' and s.setdatabase = 0
        and s.setrole = (select oid from pg_roles where rolname = 'authenticator'))
  ) then
    raise exception 'Review the existing PostgREST pre-request hook before replacing it.';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'safebus_private.enforce_active_api_session';

create or replace function public.register_current_user_session(
  p_device_label text default null, p_user_agent text default null
)
returns public.user_sessions
language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare v_session public.user_sessions;
begin
  if not public.is_current_user_session_active() then
    raise exception 'An active SafeBus session is required.' using errcode = '42501';
  end if;
  insert into public.user_sessions (
    id, user_id, tenant_id, device_label, user_agent, last_active_at
  ) select (auth.jwt() ->> 'session_id')::uuid, p.id, p.tenant_id,
      left(nullif(btrim(p_device_label), ''), 200),
      left(nullif(btrim(p_user_agent), ''), 1000), now()
    from public.profiles p where p.id = auth.uid()
  on conflict (id) do update set
    last_active_at = now(),
    device_label = coalesce(excluded.device_label, user_sessions.device_label),
    user_agent = coalesce(excluded.user_agent, user_sessions.user_agent)
  where user_sessions.user_id = auth.uid() and user_sessions.revoked_at is null
  returning * into v_session;
  if v_session.id is null then
    raise exception 'Session cannot be registered.' using errcode = '42501';
  end if;
  return v_session;
end;
$$;

create or replace function safebus_private.revoke_all_user_sessions(p_user_id uuid)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare v_count integer;
begin
  if not coalesce(safebus_private.current_user_role() in ('platform_super_admin', 'tenant_admin'), false) then
    raise exception 'Only an administrator can revoke sessions.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  perform safebus_private.enforce_recent_auth_for_sensitive_action();
  if not exists (
    select 1 from public.profiles p where p.id = p_user_id
      and (safebus_private.current_user_role() = 'platform_super_admin'
           or p.tenant_id = safebus_private.current_tenant_id())
  ) then
    raise exception 'User not found in your administrative scope.' using errcode = 'P0002';
  end if;
  update public.user_sessions set revoked_at = now(), revoked_by = auth.uid()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_count = row_count;
  -- Audit while the administrator still has a valid session (including self
  -- revocation), then revoke Auth in the same transaction. Any failure rolls back.
  perform safebus_private.write_audit_event(
    'account.revoked', 'profile', p_user_id, null, 'success',
    jsonb_build_object('sessions_revoked', v_count)
  );
  delete from auth.sessions where user_id = p_user_id;
  return v_count;
end;
$$;

-- S1: A restrictive SELECT policy also constrains any legacy broad admin policy.
create policy safebus_school_location_scope on public.driver_trip_current_locations
as restrictive for select to authenticated
using (
  (select safebus_private.current_user_role()) <> 'school_admin'
  or exists (
    select 1 from public.routes r
    where r.id = driver_trip_current_locations.route_id
      and r.tenant_id = driver_trip_current_locations.tenant_id
      and r.school_id = (select safebus_private.current_school_id())
      and r.tenant_id = (select safebus_private.current_tenant_id())
  )
);
create policy safebus_school_location_scope on public.driver_trip_location_updates
as restrictive for select to authenticated
using (
  (select safebus_private.current_user_role()) <> 'school_admin'
  or exists (
    select 1 from public.routes r
    where r.id = driver_trip_location_updates.route_id
      and r.tenant_id = driver_trip_location_updates.tenant_id
      and r.school_id = (select safebus_private.current_school_id())
      and r.tenant_id = (select safebus_private.current_tenant_id())
  )
);

-- S2: PostgreSQL roles are shared by all signed-in users. Column grants cannot
-- distinguish admins from guardians, so private notes are RPC-only for admins.
revoke select on public.student_guardians from public, anon, authenticated;
do $$
declare v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
  from pg_attribute where attrelid = 'public.student_guardians'::regclass
    and attnum > 0 and not attisdropped;
  execute format('revoke select (%s) on public.student_guardians from public, anon, authenticated', v_columns);
end;
$$;
grant select (id, tenant_id, student_id, guardian_id, relationship,
  can_receive_notifications, status, access_expires_at, created_at, updated_at)
on public.student_guardians to authenticated;

create or replace function public.get_admin_student_guardian_links(p_student_id uuid)
returns setof public.student_guardians
language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
begin
  if not public.is_current_user_session_active()
     or not coalesce(safebus_private.current_user_role() in
       ('platform_super_admin', 'tenant_admin', 'transportation_admin', 'school_admin'), false) then
    raise exception 'An active administrator session is required.' using errcode = '42501';
  end if;
  return query select sg.* from public.student_guardians sg
    join public.students s on s.id = sg.student_id and s.tenant_id = sg.tenant_id
    where s.id = p_student_id
      and safebus_private.can_write_student_roster(s.tenant_id, s.school_id)
    order by sg.created_at desc, sg.id;
end;
$$;
revoke all on function public.get_admin_student_guardian_links(uuid) from public, anon;
grant execute on function public.get_admin_student_guardian_links(uuid) to authenticated, service_role;

-- S4: Remains a private policy validator, not an anonymously callable API.
revoke all on function safebus_private.bus_service_entities_in_tenant(uuid, uuid, uuid)
from public, anon;

-- S5: Bind user buckets to the authenticated subject and use fixed action windows
-- and ceilings. Callers can lower their own cap, but cannot target another actor,
-- increase the server ceiling, or move into arbitrary window/bucket namespaces.
create or replace function public.check_rate_limit(
  p_action text, p_actor_identifier text,
  p_max integer default 10, p_window_seconds integer default 60
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_ceiling integer;
  v_window_seconds integer;
  v_window_start timestamptz;
  v_actor_hash text;
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    if not public.is_current_user_session_active()
       or p_actor_identifier is distinct from auth.uid()::text then
      raise exception 'Rate-limit actor must be the active caller.' using errcode = '42501';
    end if;
  end if;
  select limits.ceiling, limits.window_seconds into v_ceiling, v_window_seconds
  from (values
    ('login', 10, 60), ('invitation', 10, 60), ('password_reset', 10, 60),
    ('onboarding', 30, 60), ('audit_write', 60, 60), ('bulk_import', 5, 3600),
    ('bulk_invitation', 12, 60), ('billing_read', 60, 60),
    ('billing_mutation', 20, 60), ('billing_portal', 10, 60)
  ) limits(action, ceiling, window_seconds) where limits.action = p_action;
  if v_ceiling is null or nullif(btrim(p_actor_identifier), '') is null
     or length(p_actor_identifier) > 320
     or p_max is null or p_max < 1 or p_max > v_ceiling
     or p_window_seconds is distinct from v_window_seconds then
    raise exception 'Invalid rate-limit policy parameters.' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window_seconds) * v_window_seconds
  );
  v_actor_hash := md5(p_actor_identifier);
  insert into public.rate_limit_buckets (
    bucket_key, action, actor_identifier, window_start, count
  ) values (
    p_action || ':' || left(v_actor_hash, 16) || ':' || extract(epoch from v_window_start)::bigint::text,
    p_action, v_actor_hash, v_window_start, 1
  ) on conflict (bucket_key, action, actor_identifier, window_start)
  do update set count = least(public.rate_limit_buckets.count, v_ceiling) + 1
  returning count into v_count;
  return v_count <= p_max;
end;
$$;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, text, integer, integer) to authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
