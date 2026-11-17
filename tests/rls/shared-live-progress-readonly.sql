begin transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
do $verify$
declare r text;
begin
  if not exists(select 1 from pg_class where oid='safebus_private.live_bus_progress_cache'::regclass and relrowsecurity)
    or exists(select 1 from pg_policy where polrelid='safebus_private.live_bus_progress_cache'::regclass) then
    raise exception 'LIVE_PROGRESS_PRIVATE_TABLE';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(r,'safebus_private.live_bus_progress_cache','SELECT,INSERT,UPDATE,DELETE')
      or has_function_privilege(r,'safebus_private.shared_live_bus_progress(uuid,jsonb,jsonb,text)','EXECUTE')
      or has_function_privilege(r,'safebus_private.invalidate_live_bus_progress()','EXECUTE') then
      raise exception 'LIVE_PROGRESS_PRIVATE_ACCESS';
    end if;
  end loop;
  if exists(select 1 from pg_proc where oid='safebus_private.shared_live_bus_progress(uuid,jsonb,jsonb,text)'::regprocedure and prosecdef) then
    raise exception 'LIVE_PROGRESS_INVOKER_REQUIRED';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O'
      and tgfoid='safebus_private.invalidate_live_bus_progress()'::regprocedure
      and ((tgrelid='public.driver_trips'::regclass and tgname='invalidate_live_bus_progress_trip')
        or (tgrelid='public.driver_trip_current_locations'::regclass and tgname='invalidate_live_bus_progress_location'))) <> 2 then
    raise exception 'LIVE_PROGRESS_INVALIDATION_REQUIRED';
  end if;
  if not has_function_privilege('authenticated','public.get_guardian_bus_service_lines(text)','EXECUTE')
    or has_function_privilege('anon','public.get_guardian_bus_service_lines(text)','EXECUTE') then
    raise exception 'LIVE_PROGRESS_RPC_ACCESS';
  end if;
end;
$verify$;
rollback;
