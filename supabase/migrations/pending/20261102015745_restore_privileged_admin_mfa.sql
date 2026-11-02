-- Prepared from the hosted BusSafe catalog, 2026-11-02. Pending protected release.
-- Repair the recipient-MFA exemption that also exempted privileged administrators.
-- Keep existing own-account invitation/password bootstrap reachable before MFA.
-- No profile, session, consent, policy, grant or notification records are changed.
do $baseline$
declare expected record;
begin
  for expected in select * from (values
    ('safebus_private.has_completed_optional_mfa()', '993c7430149d80d7b5ed93be04a9fb55'),
    ('safebus_private.enforce_active_api_session()', 'd64d2cfd09e9d80cc37da97dd166a5d3'),
    ('safebus_private.has_verified_mfa()', 'ce806af4a38645412cb02ed01ea100c1'),
    ('public.complete_invited_account()', 'd7c430105e2b241e5938b9c1486ce53f'),
    ('public.enforce_new_password_policy(text)', 'fdef91973c112f4cdebabb608d9d5c69')
  ) item(signature,digest) loop
    if md5(replace(pg_get_functiondef(to_regprocedure(expected.signature)),chr(13),'')) is distinct from expected.digest then
      raise exception 'Privileged MFA baseline differs.' using errcode='55000';
    end if;
  end loop;
end;
$baseline$;

create or replace function safebus_private.has_completed_optional_mfa()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or (
      not exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('tenant_admin', 'transportation_admin', 'platform_super_admin', 'school_admin')
      )
      and not exists (
        select 1 from public.profiles p
        join auth.mfa_factors f on f.user_id = p.id and f.status = 'verified'
        where p.id = auth.uid() and p.role in ('guardian', 'driver')
      )
    )
  );
$function$;

create or replace function safebus_private.enforce_active_api_session()
returns void language plpgsql security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
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
  if v_path in ('rpc/register_current_user_session', 'rpc/record_own_auth_event',
               'rpc/enforce_new_password_policy', 'rpc/complete_invited_account')
     and v_method = 'POST' then return; end if;
  raise exception 'Complete multi-factor authentication to continue.' using errcode = '42501';
end;
$function$;
