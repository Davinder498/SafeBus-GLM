-- Capacity activation is NOT a routine migration. Requires isolated fleet
-- qualification and an explicit reviewed, protected transaction setting:
-- SET LOCAL safebus.tracking_capacity_approved = 'true';
-- Do not switch production cron scheduling merely because this file exists.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $activate$
declare
  job record;
  shard integer;
begin
  if pg_catalog.current_setting('safebus.tracking_capacity_approved', true) is distinct from 'true' then
    raise exception 'Capacity activation requires a protected qualification gate.'
      using errcode='55000';
  end if;
  if (select count(*) from cron.job
        where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
          and schedule='1 second' and username=current_user) <> 16
     or (select count(*) from cron.job
        where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
          and active) <> 1
     or not exists(select 1 from cron.job
        where jobname='safebus-shared-tracking-00' and active
          and command like '%dispatch_compact_shared_tracking%')
  then
    raise exception 'Unexpected shared tracking schedule; refuse activation.'
      using errcode='55000';
  end if;

  -- This changes only cron scheduling: the private, authorization-neutral
  -- shared worker and its 256-item bounded batch remain identical.
  for job in select jobid, jobname from cron.job
    where jobname ~ '^safebus-shared-tracking-(0[0-9]|1[0-5])$'
    order by jobname
  loop
    shard := right(job.jobname, 2)::integer;
    perform cron.alter_job(
      job.jobid,
      active := true,
      command := pg_catalog.format(
        'set local statement_timeout = ''750ms''; set local lock_timeout = ''100ms''; select safebus_private.dispatch_shared_tracking(%s, 256);',
        shard
      )
    );
  end loop;
end;
$activate$;
