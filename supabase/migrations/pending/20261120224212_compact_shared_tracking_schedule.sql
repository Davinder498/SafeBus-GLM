-- Small-fleet tracking schedule. Keep old job IDs so existing history pruning
-- and rollback still cover all sixteen shards. No queue or audit rows are deleted.
set local lock_timeout = '2s';
set local statement_timeout = '5s';

create function safebus_private.dispatch_compact_shared_tracking()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  next_shard integer;
  result jsonb;
  failed integer := 0;
  started timestamptz := pg_catalog.clock_timestamp();
begin
  -- The existing shard index serves one bounded readiness lookup per shard.
  -- Visit oldest ready work first, and skip shards with no work.
  for next_shard in
    select s.shard
    from pg_catalog.generate_series(0, 15) s(shard)
    cross join lateral (
      select q.available_at from safebus_private.shared_tracking_queue q
      where q.shard = s.shard and q.available_at <= started
      order by q.available_at, q.driver_trip_id limit 1
    ) ready
    order by ready.available_at, s.shard
  loop
    exit when pg_catalog.clock_timestamp() - started >= interval '450 milliseconds';
    result := safebus_private.dispatch_shared_tracking(next_shard, 16);
    failed := failed + (result->>'failed_scopes')::integer;
  end loop;
  return failed;
end;
$$;
revoke all on function safebus_private.dispatch_compact_shared_tracking()
  from public, anon, authenticated, service_role;

do $schedule$
declare job record;
begin
  if (select count(*) from cron.job
      where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
        and active and schedule = '1 second' and username = current_user) <> 16
  then raise exception 'Shared tracking schedule differs from reviewed baseline'; end if;

  for job in select jobid, jobname from cron.job
    where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
    order by jobname
  loop
    if job.jobname = 'safebus-shared-tracking-00' then
      perform cron.alter_job(job.jobid, command := $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_compact_shared_tracking();
$job$);
    else
      perform cron.alter_job(job.jobid, active := false);
    end if;
  end loop;
end $schedule$;
