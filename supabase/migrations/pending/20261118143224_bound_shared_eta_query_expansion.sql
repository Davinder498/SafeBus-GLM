-- Keep the per-stop state and ETA expressions from being repeatedly expanded
-- into consumers. These query-local results contain the same rows and values;
-- cache keys, invalidation, authorization and source locks are unchanged.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('safebus_private.shared_live_bus_progress(uuid,jsonb,jsonb,text)'::regprocedure) into definition;
  if md5(definition) <> '2c553bc8ccd824de92a91000e60153d6' then
    raise exception 'SHARED_ETA_BASELINE_MISMATCH';
  end if;
  definition := replace(definition, '), stop_states as (', '), stop_states as materialized (');
  definition := replace(definition, '), stop_eta as (', '), stop_eta as materialized (');
  execute definition;
end;
$migration$;
