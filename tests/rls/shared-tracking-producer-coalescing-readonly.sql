-- Production verification is catalog-only: no writes or broadcast messages.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
do $$
declare v_role text;
begin
  if not exists(select 1 from pg_trigger
      where tgrelid='public.driver_trip_current_locations'::regclass
      and tgname='notify_tracking_location_change' and tgenabled='O'
      and tgfoid='safebus_private.notify_tracking_location_change()'::regprocedure)
    then raise exception 'Tracking producer trigger is not enabled.'; end if;
  if not exists(select 1 from pg_class where oid='safebus_private.shared_tracking_queue'::regclass
      and relrowsecurity and relowner='postgres'::regrole)
    then raise exception 'Shared queue protection changed.'; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,'safebus_private.notify_tracking_location_change()','EXECUTE')
      or has_table_privilege(v_role,'safebus_private.shared_tracking_queue','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      then raise exception 'Unexpected tracking producer privilege.'; end if;
  end loop;
end;
$$;
rollback;
