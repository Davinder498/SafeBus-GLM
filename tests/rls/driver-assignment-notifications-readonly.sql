begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

do $$
declare
  v_getter text;
  v_setter text;
  v_policy text;
begin
  select pg_get_functiondef('public.get_driver_delivery_preferences()'::regprocedure)
    into v_getter;
  select pg_get_functiondef('public.set_driver_delivery_preferences(jsonb)'::regprocedure)
    into v_setter;

  if v_getter not like '%auth.uid()%' or v_getter not like '%role = ''driver''%'
    or v_getter not like '%d.profile_id = v_profile.id%'
    or v_getter not like '%d.tenant_id = v_profile.tenant_id%' then
    raise exception 'Driver preference getter is not bound to the authenticated driver and tenant';
  end if;
  if v_setter not like '%auth.uid()%' or v_setter not like '%d.profile_id = v_profile.id%'
    or v_setter not like '%d.tenant_id = v_profile.tenant_id%'
    or v_setter not like '%category <> ''assignments''%' then
    raise exception 'Driver preference setter does not deny cross-driver/category access';
  end if;

  if has_function_privilege('anon', 'public.get_driver_delivery_preferences()', 'execute')
    or has_function_privilege(
      'anon', 'public.set_driver_delivery_preferences(jsonb)', 'execute'
    ) then
    raise exception 'Anonymous driver preference execution is allowed';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.get_driver_delivery_preferences()', 'execute'
  ) then
    raise exception 'Authenticated driver preference execution is unavailable';
  end if;

  select qual into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'user_notifications'
    and policyname = 'user_notifications_recipient_select';
  if v_policy is null
    or v_policy not like '%auth.uid()%'
    or v_policy not like '%driver_can_access_notification%' then
    raise exception 'Driver inbox policy is not assignment-only and recipient-bound';
  end if;

  if has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'select')
    or has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'insert')
    or has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'update')
    or has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'delete') then
    raise exception 'Browser access to the recipient email outbox is allowed';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.user_notifications'::regclass
      and tgname = 'enforce_driver_assignment_only_notification'
      and not tgisinternal
  ) then
    raise exception 'Driver assignment-only creation trigger is missing';
  end if;
end;
$$;

rollback;
