-- SafeBus Alberta - Phase 8 guardian privacy and notification queue checks.
-- Run against hosted Supabase DEV after applying migration 0087.

begin;

do $$
declare
  v_claim text;
  v_resolve text;
  v_visibility_result text;
  v_status_constraint text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_guardians'
      and column_name = 'access_expires_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_guardians'
      and column_name = 'notification_preferences_set_at'
  ) then
    raise exception 'TEST FAILED: guardian expiry or explicit preference fields are missing';
  end if;

  if to_regprocedure('public.get_guardian_bus_visibility_v2()') is null
    or to_regprocedure('public.get_guardian_notification_preferences()') is null
    or to_regprocedure('public.set_guardian_notification_preferences(uuid,boolean,boolean,boolean)') is null
    or to_regprocedure('public.admin_set_guardian_access_expiry(uuid,timestamp with time zone)') is null
    or to_regprocedure('public.requeue_guardian_notification_dead_letter(uuid)') is null then
    raise exception 'TEST FAILED: a Phase 8 guardian authorization RPC is missing';
  end if;

  select lower(pg_get_function_result('public.get_guardian_bus_visibility_v2()'::regprocedure))
  into v_visibility_result;
  if v_visibility_result ~ '(route_id|route_name|route_code|stop|driver_id|bus_id|trip_id|tenant_id|guardian_id|speed)' then
    raise exception 'TEST FAILED: guardian visibility result exposes operational scope: %', v_visibility_result;
  end if;

  if has_function_privilege('authenticated', 'public.get_guardian_bus_visibility()', 'execute')
    or not has_function_privilege('authenticated', 'public.get_guardian_bus_visibility_v2()', 'execute')
    or has_function_privilege('anon', 'public.get_guardian_bus_visibility_v2()', 'execute') then
    raise exception 'TEST FAILED: expiry-aware guardian visibility privileges are incorrect';
  end if;

  if has_table_privilege('authenticated', 'public.guardian_notification_delivery_policies', 'select')
    or has_table_privilege('authenticated', 'public.guardian_notification_outbox', 'select') then
    raise exception 'TEST FAILED: internal notification policy or delivery data is browser-readable';
  end if;

  if exists (
    select 1 from public.guardian_notification_delivery_policies
    where privacy_review_status <> 'approved' and notifications_enabled
  ) then
    raise exception 'TEST FAILED: an unapproved tenant has notifications enabled';
  end if;

  select lower(pg_get_functiondef(
    'public.claim_guardian_notification_email_batch(integer,integer,integer,integer)'::regprocedure
  )) into v_claim;
  if position('skip locked' in v_claim) = 0
    or position('available_after' in v_claim) = 0
    or position('access_expires_at' in v_claim) = 0
    or position('notification_preferences_set_at' in v_claim) = 0
    or position('tenant_daily_limit' in v_claim) = 0
    or position('tenant_per_minute_limit' in v_claim) = 0
    or position('p_provider_limit_per_minute' in v_claim) = 0
    or position('order by' in v_claim) = 0 then
    raise exception 'TEST FAILED: claim contract lacks ordering, leases, preferences, expiry, or delivery limits';
  end if;

  select lower(pg_get_functiondef(
    'public.resolve_guardian_notification_email_payload(uuid)'::regprocedure
  )) into v_resolve;
  if position('access_expires_at' in v_resolve) = 0
    or position('notification_preferences_set_at' in v_resolve) = 0
    or position('privacy_review_status' in v_resolve) = 0
    or position('notify_pickup' in v_resolve) = 0
    or position('notify_dropoff' in v_resolve) = 0 then
    raise exception 'TEST FAILED: delivery does not revalidate access, consent, event preference, and privacy approval';
  end if;

  select lower(pg_get_constraintdef(oid)) into v_status_constraint
  from pg_constraint
  where conrelid = 'public.guardian_notification_outbox'::regclass
    and conname = 'guardian_notification_outbox_status_check';
  if position('dead_lettered' in coalesce(v_status_constraint, '')) = 0
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'guardian_notification_outbox'
        and column_name = 'dead_lettered_at'
    ) then
    raise exception 'TEST FAILED: durable queue has no distinct dead-letter state';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.get_guardian_notification_preferences();
    raise exception 'TEST FAILED: anonymous preference access was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_guardian_notification_preferences(
      '00000000-0000-0000-0000-000000000000', true, true, true
    );
    raise exception 'TEST FAILED: anonymous preference mutation was not denied';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform public.claim_guardian_notification_email_batch(1, 120, 5, 50);
    raise exception 'TEST FAILED: browser role claimed notification work';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.resolve_guardian_notification_email_payload(
      '00000000-0000-0000-0000-000000000000'
    );
    raise exception 'TEST FAILED: browser role resolved a recipient payload';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
