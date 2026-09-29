-- Guardian delivery preferences v2 authorization contract.
-- Run only after 0110 on an approved isolated database. This script is
-- rollback-only and must not be executed against the production-designated DB.

begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

do $$
declare
  v_set_source text;
  v_enqueue_source text;
begin
  if has_function_privilege('anon', 'public.get_guardian_delivery_preferences_v2()', 'execute')
    or has_function_privilege('anon', 'public.set_guardian_delivery_preferences_v2(jsonb)', 'execute') then
    raise exception 'TEST FAILED: anonymous role can execute guardian preference RPCs';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.get_guardian_delivery_preferences_v2()', 'execute'
  ) or not has_function_privilege(
    'authenticated', 'public.set_guardian_delivery_preferences_v2(jsonb)', 'execute'
  ) then
    raise exception 'TEST FAILED: authenticated preference grants are missing';
  end if;

  if has_table_privilege('authenticated', 'public.user_notification_settings', 'select')
    or has_table_privilege('authenticated', 'public.user_notification_category_preferences', 'select')
    or has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'select') then
    raise exception 'TEST FAILED: private delivery tables are browser-readable';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_notification_settings'
      and column_name = 'email_enabled' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_notification_category_preferences'
      and column_name = 'email_enabled' and is_nullable = 'NO'
  ) then
    raise exception 'TEST FAILED: email master/category state is incomplete';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guardian_notification_outbox'
      and column_name = 'user_notification_id'
  ) then
    raise exception 'TEST FAILED: canonical notification outbox reference is missing';
  end if;

  select pg_get_functiondef(
    'public.set_guardian_delivery_preferences_v2(jsonb)'::regprocedure
  ) into v_set_source;
  if v_set_source !~ 'p\.role = ''guardian'''
    or v_set_source !~ 'g\.tenant_id = v_profile\.tenant_id'
    or v_set_source !~ 'for update'
    or v_set_source !~ 'status = ''cancelled'''
    or v_set_source ~ 'update public\.user_notifications' then
    raise exception 'TEST FAILED: atomic guardian/tenant, cancellation, or inbox boundary is missing';
  end if;

  select pg_get_functiondef(
    'safebus_private.enqueue_guardian_email_for_notification()'::regprocedure
  ) into v_enqueue_source;
  if v_enqueue_source !~ 'new\.recipient_role <> ''guardian'''
    or v_enqueue_source !~ 'settings\.email_enabled'
    or v_enqueue_source !~ 'cp\.email_enabled'
    or v_enqueue_source !~ 'policy\.notifications_enabled'
    or v_enqueue_source !~ 'sg\.status = ''active''' then
    raise exception 'TEST FAILED: queue-time authorization recheck is incomplete';
  end if;

  if has_function_privilege(
    'authenticated', 'safebus_private.guardian_email_outbox_is_eligible(uuid)', 'execute'
  ) then
    raise exception 'TEST FAILED: private delivery eligibility helper is browser-executable';
  end if;

  raise notice 'Guardian delivery v2 authorization contract passed.';
end;
$$;

rollback;
