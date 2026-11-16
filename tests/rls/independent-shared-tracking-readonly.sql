-- Post-install catalog/negative privileges only; no writes, fixtures or deliveries.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
do $$
declare v_role text; v_shard integer;
begin
  if not exists(select 1 from pg_class where oid=to_regclass('safebus_private.shared_tracking_queue')
    and relrowsecurity and relowner='postgres'::regrole)
    or exists(select 1 from pg_policy where polrelid=to_regclass('safebus_private.shared_tracking_queue')) then
    raise exception 'Shared queue privacy contract changed.';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'safebus_private.shared_tracking_queue','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_function_privilege(v_role,'safebus_private.dispatch_shared_tracking(integer,integer)','EXECUTE')
      or has_function_privilege(v_role,'safebus_private.shared_tracking_queue_health()','EXECUTE') then
      raise exception 'Unexpected shared worker client privilege.';
    end if;
  end loop;
  for v_shard in 0..15 loop
    if not exists(select 1 from cron.job
      where jobname='safebus-shared-tracking-'||lpad(v_shard::text,2,'0')
        and active and schedule='1 second' and username='postgres'
        and btrim(regexp_replace(command,'[[:space:]]+',' ','g'))=
          'set local statement_timeout = ''750ms''; set local lock_timeout = ''100ms''; select safebus_private.dispatch_shared_tracking('||v_shard::text||', 256);') then
      raise exception 'Shared worker job, owner or bounds changed.';
    end if;
  end loop;
end;
$$;
select safebus_private.shared_tracking_queue_health() as shared_tracking_observation;
rollback;
