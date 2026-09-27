-- SafeBus Alberta simplified guardian delivery preference verification.
-- Run only after migration 0109 is approved and deployed. This check is safe
-- for the existing production-designated database: it is read-only and always
-- rolls back.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

do $$
declare
  v_setter text;
  v_link_trigger_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guardians'
      and column_name = 'pickup_dropoff_email_enabled'
      and data_type = 'boolean'
  ) then
    raise exception 'TEST FAILED: guardian account-level email preference is missing';
  end if;

  if has_function_privilege('anon', 'public.get_guardian_delivery_preferences()', 'execute')
    or has_function_privilege(
      'anon',
      'public.set_guardian_delivery_preferences(boolean,boolean)',
      'execute'
    ) then
    raise exception 'TEST FAILED: anonymous users can access guardian delivery preferences';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_guardian_delivery_preferences()',
    'execute'
  ) or not has_function_privilege(
    'authenticated',
    'public.set_guardian_delivery_preferences(boolean,boolean)',
    'execute'
  ) then
    raise exception 'TEST FAILED: authenticated preference grants are missing';
  end if;

  select lower(pg_get_functiondef(
    'public.set_guardian_delivery_preferences(boolean,boolean)'::regprocedure
  )) into v_setter;
  if position('update public.student_guardians' in v_setter) = 0
    or position('guardian_student_push_preferences' in v_setter) = 0
    or position('user_notification_category_preferences' in v_setter) = 0 then
    raise exception 'TEST FAILED: setter does not synchronize every current delivery gate';
  end if;

  select count(*) into v_link_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'student_guardians'
    and not t.tgisinternal
    and t.tgname in (
      'zz_student_guardians_apply_delivery_defaults',
      'student_guardians_sync_push_defaults'
    );
  if v_link_trigger_count <> 2 then
    raise exception 'TEST FAILED: future guardian links do not inherit both delivery choices';
  end if;
end $$;

rollback;
