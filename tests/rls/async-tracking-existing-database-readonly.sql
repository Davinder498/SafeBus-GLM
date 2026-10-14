-- Only AFTER approved C1 installation. Metadata/negative checks only; no fixtures.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
do $$
declare v_role text;
begin
  if to_regclass('safebus_private.tracking_invalidation_queue') is null then
    raise exception 'C1 is not installed; keep the milestone pending.';
  end if;
  if not exists(select 1 from pg_class where oid = 'safebus_private.tracking_invalidation_queue'::regclass and relrowsecurity) then
    raise exception 'Tracking queue RLS missing.';
  end if;
  if exists(select 1 from pg_policy where polrelid = 'safebus_private.tracking_invalidation_queue'::regclass) then
    raise exception 'Tracking queue must have no client policies.';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'safebus_private.tracking_invalidation_queue','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_function_privilege(v_role,'safebus_private.dispatch_tracking_invalidations(integer,integer)','EXECUTE')
       or has_function_privilege(v_role,'safebus_private.send_queued_tracking_invalidation(text)','EXECUTE')
       or has_function_privilege(v_role,'safebus_private.notify_tracking_location_change()','EXECUTE') then
      raise exception 'Unexpected client access to internal tracking worker.';
    end if;
  end loop;
  if not exists(select 1 from pg_trigger where tgrelid = 'public.driver_trip_current_locations'::regclass
    and tgname = 'notify_tracking_location_change' and tgenabled = 'O'
    and tgfoid = 'safebus_private.notify_tracking_location_change()'::regprocedure) then
    raise exception 'Tracking queue trigger not enabled/bound.';
  end if;
  if not exists(select 1 from pg_proc where oid = 'safebus_private.dispatch_tracking_invalidations(integer,integer)'::regprocedure
    and prosecdef and 'search_path=""' = any(proconfig)) then
    raise exception 'Tracking worker search path/definer contract changed.';
  end if;
  if not exists(select 1 from cron.job where jobname = 'safebus-tracking-invalidation-dispatcher'
    and active and schedule = '1 second'
    and btrim(regexp_replace(command, '[[:space:]]+', ' ', 'g')) =
      'set local statement_timeout = ''750ms''; set local lock_timeout = ''100ms''; select safebus_private.dispatch_tracking_invalidations(10, 250);'
    and username = (select pg_get_userbyid(proowner) from pg_proc
      where oid = 'safebus_private.dispatch_tracking_invalidations(integer,integer)'::regprocedure)) then
    raise exception 'Tracking worker job/owner/bounds differ from reviewed configuration.';
  end if;
end;
$$;
select 'PASS: C1 internal-worker catalog and negative privileges' as result;
rollback;
