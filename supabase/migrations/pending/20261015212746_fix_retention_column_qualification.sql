-- Pending privacy correction. Not in the active manifest; do not apply manually.
-- Replaces only ambiguous column references in the observed private function.
-- It does not approve periods/holds, enable deletion, change grants or install jobs.
do $retention_column_fix$
declare
  v_before text;
  v_after text;
  v_table text;
  v_pattern text;
  v_matches integer;
begin
  if not exists (
    select 1 from public.retention_execution_control
    where id = 1 and destructive_enabled = false
  ) then
    raise exception 'Retention correction requires destructive execution to remain disabled.';
  end if;

  v_before := replace(pg_get_functiondef(
    'safebus_private.run_retention_deletion(text,boolean)'::regprocedure
  ), chr(13), '');
  if md5(v_before) <> '2e47fad329f75031f5c7227b65d38b4b' then
    raise exception 'Retention function differs from the reviewed observed definition.';
  end if;

  v_after := v_before;
  foreach v_table in array array[
    'tenant_onboarding_invitations', 'students', 'student_guardians', 'drivers',
    'bus_tracking_sessions', 'bus_run_dispatches', 'driver_trips',
    'guardian_notification_outbox'
  ] loop
    v_pattern := '(from public\.' || v_table || '\s+where )status( in \()';
    select count(*) into v_matches from regexp_matches(v_after, v_pattern, 'g');
    if v_matches <> 2 then
      raise exception 'Retention predicate count differs from the reviewed definition: %.', v_table;
    end if;
    v_after := regexp_replace(v_after, v_pattern, '\1' || v_table || '.status\2', 'g');
  end loop;

  if v_after = v_before or v_after ~ 'where\s+status\s+in\s*\(' then
    raise exception 'Retention qualification did not cover the reviewed ambiguous predicates.';
  end if;
  -- completed_at is also an output parameter and ambiguous in dispatch expiry.
  v_pattern := 'coalesce\(completed_at, cancelled_at, prepared_at\)';
  select count(*) into v_matches from regexp_matches(v_after, v_pattern, 'g');
  if v_matches <> 2 then
    raise exception 'Retention dispatch timestamp count differs from the reviewed definition.';
  end if;
  v_after := regexp_replace(v_after, v_pattern,
    'coalesce(bus_run_dispatches.completed_at, bus_run_dispatches.cancelled_at, bus_run_dispatches.prepared_at)', 'g');

  -- CREATE OR REPLACE retains the existing identity, owner, ACL and hardened
  -- search path. Exact-definition guard prevents overwriting unrelated changes.
  execute v_after;
end;
$retention_column_fix$;
