-- Keep active driver-trip GPS collection and the server cadence contract at three seconds.

do $migration$
declare
  v_function regprocedure := to_regprocedure(
    'public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)'
  );
  v_definition text;
  v_updated text;
begin
  if v_function is null then
    raise exception 'Required function public.ingest_driver_location_event(...) does not exist.';
  end if;

  select pg_get_functiondef(v_function) into v_definition;

  v_updated := replace(
    v_definition,
    $old$'recordedAt', v_duplicate.recorded_at, 'nextPingInMs', 30000$old$,
    $new$'recordedAt', v_duplicate.recorded_at, 'nextPingInMs', 3000$new$
  );
  if v_updated = v_definition then
    raise exception 'The duplicate-event GPS cadence contract was not found.';
  end if;
  v_definition := v_updated;

  v_updated := replace(
    v_definition,
    $old$  v_next_ms := case
    when coalesce(p_battery_percent, 100) <= 10 then 120000
    when coalesce(p_battery_percent, 100) <= 20 then 60000
    when coalesce(p_speed_mps, 0) >= 2 then 5000
    else 30000
  end;$old$,
    $new$  v_next_ms := 3000;$new$
  );
  if v_updated = v_definition then
    raise exception 'The adaptive GPS cadence policy was not found.';
  end if;

  execute v_updated;
end;
$migration$;
