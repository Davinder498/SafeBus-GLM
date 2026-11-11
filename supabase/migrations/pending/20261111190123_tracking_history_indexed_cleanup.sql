-- Forward repair for the installed tracking worker. Do not edit 0125.
-- The protected workflow retains its 5s statement/1s lock limits; abort safely
-- if this index cannot be built within those bounds on the hosted database.
create index safebus_tracking_history_job_end_idx
  on cron.job_run_details (jobid, end_time, runid);

create or replace function safebus_private.prune_tracking_worker_history()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer;
  v_cutoff timestamptz := pg_catalog.statement_timestamp() - interval '48 hours';
begin
  -- Each indexed lookup is bounded even when no rows qualify. Limit the combined
  -- deletion to 1000, and never select unfinished runs or another job's history.
  with candidates as materialized (
    select r.runid, r.end_time
    from cron.job j
    cross join lateral (
      select d.runid, d.end_time from cron.job_run_details d
      where d.jobid = j.jobid and d.end_time < v_cutoff
      order by d.end_time, d.runid limit 1000
    ) r
    where j.jobname in ('safebus-tracking-invalidation-dispatcher', 'safebus-tracking-invalidation-history')
  )
  delete from cron.job_run_details d where d.runid in (
    select c.runid from candidates c order by c.end_time, c.runid limit 1000
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function safebus_private.prune_tracking_worker_history()
  from public, anon, authenticated, service_role;
