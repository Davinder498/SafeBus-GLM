-- Retired, unapplied one-step worker cutover. Keep this explicit refusal so
-- historical references cannot accidentally bypass staged fleet qualification.
-- Use 20261123100000_staged_shared_tracking_jobs.sql for guarded 1->2->4->8->16.
do $retired$
begin
  raise exception 'Direct 16-worker activation retired; use staged tracking jobs.'
    using errcode='55000';
end;
$retired$;
