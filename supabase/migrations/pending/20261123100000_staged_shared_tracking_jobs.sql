-- Prepared staged scaling of the EXISTING sixteen shared-tracking cron jobs.
-- Roll out only after isolated qualification and explicit protected release:
-- set local safebus.tracking_capacity_approved = 'true';
-- set local safebus.tracking_capacity_target = '2'; -- or 4, 8, 16
-- The reverse step (16->8, etc.) additionally requires capacity_rollback_approved.
-- This SQL is deliberately outside the automatic migration manifest.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- Each worker owns a disjoint congruence class of the same sixteen queue shards.
-- A 2-worker stage covers even/odd shards; 4 workers cover four groups, etc.
-- Every stage covers ALL 16 shards; no inactive range is abandoned.
create function safebus_private.dispatch_grouped_shared_tracking(
  p_worker integer, p_workers integer
) returns jsonb language plpgsql security definer set search_path = ''
as $group$
declare
  shard_id integer;
  result jsonb;
  total_scopes integer := 0;
  total_messages integer := 0;
  total_failed integer := 0;
  started timestamptz := pg_catalog.clock_timestamp();
  per_shard_limit integer;
begin
  if p_workers not in (1,2,4,8,16)
     or p_worker is null or p_worker < 0 or p_worker >= p_workers then
    raise exception 'Invalid grouped tracking worker bounds.' using errcode='22023';
  end if;
  per_shard_limit := 256 / (16 / p_workers);
  -- Serve oldest ready work first within this worker's disjoint set.
  for shard_id in
    select s.shard
    from pg_catalog.generate_series(0,15) s(shard)
    cross join lateral (
      select q.available_at
      from safebus_private.shared_tracking_queue q
      where q.shard=s.shard and q.available_at<=started
      order by q.available_at,q.driver_trip_id limit 1
    ) ready
    where s.shard % p_workers=p_worker
    order by ready.available_at,s.shard
  loop
    exit when pg_catalog.clock_timestamp()-started >= interval '450 milliseconds';
    result := safebus_private.dispatch_shared_tracking(shard_id,per_shard_limit);
    total_scopes := total_scopes + coalesce((result->>'scopes')::integer,0);
    total_messages := total_messages + coalesce((result->>'messages')::integer,0);
    total_failed := total_failed + coalesce((result->>'failed_scopes')::integer,0);
  end loop;
  return pg_catalog.jsonb_build_object('scopes',total_scopes,'messages',total_messages,
    'failed_scopes',total_failed,'worker',p_worker,'workers',p_workers,
    'duration_ms',extract(epoch from (pg_catalog.clock_timestamp()-started))*1000);
end;
$group$;
revoke all on function safebus_private.dispatch_grouped_shared_tracking(integer,integer)
  from public,anon,authenticated,service_role;

do $stage$
declare
  v_target integer;
  v_current integer;
  v_approved text := pg_catalog.current_setting('safebus.tracking_capacity_approved',true);
  v_rollback text := pg_catalog.current_setting('safebus.tracking_capacity_rollback_approved',true);
  job record;
  worker_number integer;
  command_text text;
begin
  if v_approved is distinct from 'true' then
    raise exception 'Staged tracking activation requires protected capacity approval.'
      using errcode='55000';
  end if;
  v_target := nullif(pg_catalog.current_setting('safebus.tracking_capacity_target',true),'')::integer;
  if v_target not in (1,2,4,8,16) or v_target is null then
    raise exception 'Invalid tracking worker target.' using errcode='22023';
  end if;
  select count(*) filter(where active) into v_current from cron.job
    where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$';
  if (select count(*) from cron.job
        where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
          and schedule='1 second' and username=current_user)<>16
     or v_current not in (1,2,4,8,16)
     or to_regprocedure('safebus_private.dispatch_shared_tracking(integer,integer)') is null
     or (v_current<>v_target*2 and v_target<>v_current*2) then
    raise exception 'Unexpected job baseline or non-adjacent worker change.'
      using errcode='55000';
  end if;
  if v_target<v_current and v_rollback is distinct from 'true' then
    raise exception 'Reducing worker count requires protected rollback approval.'
      using errcode='55000';
  end if;
  if v_current=1 then
    if not exists(select 1 from cron.job where jobname='safebus-shared-tracking-00'
      and active and command like '%dispatch_compact_shared_tracking%') then
      raise exception 'Compact baseline differs from reviewed source.' using errcode='55000';
    end if;
  else
    if exists(select 1 from cron.job
      where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
        and (active is distinct from (right(jobname,2)::integer < v_current)
          or (active and command not like
            ('%dispatch_grouped_shared_tracking('||right(jobname,2)::integer::text||','||v_current::text||')%'))))
    then
      raise exception 'Current staged worker commands do not match last stage.'
        using errcode='55000';
    end if;
  end if;
  for job in select jobid,jobname from cron.job
    where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
    order by jobname
  loop
    worker_number := right(job.jobname,2)::integer;
    command_text := case when v_target=1 then
      'set local statement_timeout = ''750ms''; set local lock_timeout = ''100ms''; select safebus_private.dispatch_compact_shared_tracking();'
    else pg_catalog.format(
      'set local statement_timeout = ''750ms''; set local lock_timeout = ''100ms''; select safebus_private.dispatch_grouped_shared_tracking(%s,%s);',
      worker_number,v_target
    ) end;
    perform cron.alter_job(job.jobid,active := worker_number<v_target,command := command_text);
  end loop;
end;
$stage$;
