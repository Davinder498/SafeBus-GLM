set local search_path = pg_catalog;
do $guard$
begin
 if not exists(select 1 from safebus_release.environment_identity where singleton
   and environment='staging' and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) then
   raise exception 'Recovery identity required'; end if;
 if exists(select 1 from auth.users) or exists(select 1 from public.tenants)
   or exists(select 1 from cron.job) or exists(select 1 from vault.secrets) then
   raise exception 'Empty isolated target required'; end if;
 if exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages') then
   raise exception 'Realtime baseline changed; never overwrite policies'; end if;
 if not (select relrowsecurity from pg_class where oid='realtime.messages'::regclass) then
   raise exception 'Realtime RLS required'; end if;
 if exists(select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
   cross join lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%') then
   raise exception 'API hook already configured; review baseline'; end if;
 if (select md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','safebus_private') and p.prokind<>'a') is distinct from '7b49c05ff34f65a829d4fdab85c164d2' then
   raise exception 'Reviewed application function baseline changed'; end if;
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
   where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')) then
   raise exception 'Schema quarantine required'; end if;
end $guard$;

-- Recovery only. Executed transactionally by release-capacity-runtime.mjs.
create policy "safebus notification broadcast receive" on realtime.messages as PERMISSIVE for SELECT to authenticated using (((extension = 'broadcast'::text) AND (realtime.topic() = ('safebus:notifications:'::text || (( SELECT auth.uid() AS uid))::text)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.profile_status))))));

create policy "safebus shared bus tracking receive" on realtime.messages as PERMISSIVE for SELECT to authenticated using (((extension = 'broadcast'::text) AND safebus_private.can_receive_bus_tracking(realtime.topic())));

create policy "safebus tracking broadcast receive" on realtime.messages as PERMISSIVE for SELECT to authenticated using (((extension = 'broadcast'::text) AND (((realtime.topic() = ('safebus:guardian:'::text || (auth.uid())::text)) AND (safebus_private.current_user_role() = 'guardian'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.guardians g
  WHERE ((g.profile_id = auth.uid()) AND (g.tenant_id = safebus_private.current_tenant_id()) AND (g.status = 'active'::text))))) OR ((safebus_private.current_tenant_id() IS NOT NULL) AND (realtime.topic() = ('safebus:tenant:'::text || (safebus_private.current_tenant_id())::text)) AND (safebus_private.current_user_role() = ANY (ARRAY['tenant_admin'::public.user_role, 'school_admin'::public.user_role, 'transportation_admin'::public.user_role]))))));

create policy "safebus_active_session" on realtime.messages as RESTRICTIVE for ALL to authenticated using (( SELECT public.is_current_user_session_active() AS is_current_user_session_active)) with check (( SELECT public.is_current_user_session_active() AS is_current_user_session_active));

create policy "safebus_optional_mfa" on realtime.messages as RESTRICTIVE for ALL to authenticated using (( SELECT safebus_private.has_completed_optional_mfa() AS has_completed_optional_mfa)) with check (( SELECT safebus_private.has_completed_optional_mfa() AS has_completed_optional_mfa));

alter role authenticator set pgrst.db_pre_request = 'safebus_private.enforce_active_api_session';
notify pgrst, 'reload config';
