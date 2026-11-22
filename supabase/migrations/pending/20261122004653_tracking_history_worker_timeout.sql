-- Restore progress on the existing bounded, 48-hour cron history cleaner.
-- Keep the minute schedule, lock timeout and exact deletion rules.
set local lock_timeout = '1s';
set local statement_timeout = '5s';

do $maintenance$
declare
  target_job_id bigint;
begin
  select j.jobid into strict target_job_id
    from cron.job j
    where j.jobname = 'safebus-tracking-invalidation-history' and j.active
      and j.schedule = '* * * * *' and j.username = current_user
      and pg_catalog.md5(pg_catalog.replace(j.command, pg_catalog.chr(13), '')) = '0f85bbf8fef55dfcc525636c5a6634fc';

  perform cron.alter_job(target_job_id, command := $job$
  set local statement_timeout = '8s';
  set local lock_timeout = '100ms';
  select safebus_private.prune_tracking_worker_history();
$job$);
end $maintenance$;
