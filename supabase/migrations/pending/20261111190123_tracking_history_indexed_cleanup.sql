-- Forward repair; never alter Supabase-owned cron tables or their indexes.
-- One private cursor bounds each sweep and revisits recent/unfinished rows later.
create table safebus_private.tracking_history_cursor (
  singleton boolean primary key default true check (singleton),
  last_runid bigint not null default 0,
  sweep_end bigint not null default 0
);
alter table safebus_private.tracking_history_cursor enable row level security;
revoke all on safebus_private.tracking_history_cursor from public, anon, authenticated, service_role;
insert into safebus_private.tracking_history_cursor(singleton) values (true);

create or replace function safebus_private.prune_tracking_worker_history()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer;
  v_last bigint;
  v_end bigint;
  v_next bigint;
  v_cutoff timestamptz := pg_catalog.statement_timestamp() - interval '48 hours';
begin
  select last_runid, sweep_end into strict v_last, v_end
  from safebus_private.tracking_history_cursor where singleton for update;
  if v_last >= v_end then
    v_last := 0;
    select coalesce(max(runid), 0) into v_end from cron.job_run_details;
  end if;
  -- Materialize at most 1000 indexed rows BEFORE filtering job or age. Advance
  -- over unrelated history too, otherwise another job's old rows stall cleanup.
  with batch as materialized (
    select d.runid, d.jobid, d.end_time from cron.job_run_details d
    where d.runid > v_last and d.runid <= v_end
    order by d.runid limit 1000
  ), removed as (
    delete from cron.job_run_details d using batch b
    where d.runid = b.runid and d.jobid = b.jobid
      and d.end_time < v_cutoff and b.end_time < v_cutoff
      and b.jobid in (select jobid from cron.job where jobname in
        ('safebus-tracking-invalidation-dispatcher', 'safebus-tracking-invalidation-history'))
    returning d.runid
  )
  select (select count(*)::integer from removed), coalesce(max(runid), v_end)
  into v_deleted, v_next from batch;
  update safebus_private.tracking_history_cursor
    set last_runid = v_next, sweep_end = v_end where singleton;
  return v_deleted;
end;
$$;
revoke all on function safebus_private.prune_tracking_worker_history()
  from public, anon, authenticated, service_role;
