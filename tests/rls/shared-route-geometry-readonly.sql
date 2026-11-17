begin transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
do $verify$
declare r text;
begin
  if not exists(select 1 from pg_class where oid='safebus_private.route_stop_geometry_cache'::regclass and relrowsecurity)
    or exists(select 1 from pg_policy where polrelid='safebus_private.route_stop_geometry_cache'::regclass) then
    raise exception 'SHARED_GEOMETRY_PRIVATE_TABLE';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(r,'safebus_private.route_stop_geometry_cache','SELECT,INSERT,UPDATE,DELETE')
      or has_function_privilege(r,'safebus_private.shared_route_stop_geometry(uuid,uuid,uuid,jsonb,text)','EXECUTE') then
      raise exception 'SHARED_GEOMETRY_PRIVATE_ACCESS';
    end if;
  end loop;
  if exists(select 1 from pg_proc where oid='safebus_private.shared_route_stop_geometry(uuid,uuid,uuid,jsonb,text)'::regprocedure and prosecdef) then
    raise exception 'SHARED_GEOMETRY_INVOKER_REQUIRED';
  end if;
  if not has_function_privilege('authenticated','public.get_guardian_bus_service_lines(text)','EXECUTE')
    or has_function_privilege('anon','public.get_guardian_bus_service_lines(text)','EXECUTE') then
    raise exception 'SHARED_GEOMETRY_RPC_ACCESS';
  end if;
end;
$verify$;
rollback;
