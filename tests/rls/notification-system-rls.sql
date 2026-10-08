-- SafeBus Alberta notification authorization acceptance fixture.
-- Execute only against an explicitly approved isolated Supabase database after
-- migration 0118. Never run this fixture against the sole production project.
begin;

-- Synthetic tenant policies and callers exist only inside this rollback-only
-- transaction. No existing tenant, profile, recipient, or queue row is changed.
insert into public.tenants (id, name, type, status) values
  ('b1180000-0000-0000-0000-000000000100', 'Notification Control Test A', 'demo', 'active'),
  ('b1180000-0000-0000-0000-000000000101', 'Notification Control Test B', 'demo', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('b1180000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'notification-control-' || n || '@test.local', '', now(), 'authenticated',
  'authenticated', '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 8) as n;

insert into public.profiles (id, tenant_id, full_name, email, role, status) values
  ('b1180000-0000-0000-0000-000000000001', 'b1180000-0000-0000-0000-000000000100', 'Tenant Admin A', 'notification-control-1@test.local', 'tenant_admin', 'active'),
  ('b1180000-0000-0000-0000-000000000002', 'b1180000-0000-0000-0000-000000000101', 'Tenant Admin B', 'notification-control-2@test.local', 'tenant_admin', 'active'),
  ('b1180000-0000-0000-0000-000000000003', 'b1180000-0000-0000-0000-000000000100', 'School Admin', 'notification-control-3@test.local', 'school_admin', 'active'),
  ('b1180000-0000-0000-0000-000000000004', 'b1180000-0000-0000-0000-000000000100', 'Transportation Admin', 'notification-control-4@test.local', 'transportation_admin', 'active'),
  ('b1180000-0000-0000-0000-000000000005', null, 'Platform Admin', 'notification-control-5@test.local', 'platform_super_admin', 'active'),
  ('b1180000-0000-0000-0000-000000000006', 'b1180000-0000-0000-0000-000000000100', 'Guardian', 'notification-control-6@test.local', 'guardian', 'active'),
  ('b1180000-0000-0000-0000-000000000007', 'b1180000-0000-0000-0000-000000000100', 'Driver', 'notification-control-7@test.local', 'driver', 'active'),
  ('b1180000-0000-0000-0000-000000000008', 'b1180000-0000-0000-0000-000000000100', 'Inactive Admin', 'notification-control-8@test.local', 'tenant_admin', 'suspended');

update public.guardian_notification_delivery_policies
set privacy_review_status = 'approved', privacy_approved_at = now()
where tenant_id = 'b1180000-0000-0000-0000-000000000100';

do $$
declare v_claim text; v_inbox text; v_registration text; v_tenant_settings text;
begin
  if to_regclass('public.user_notifications') is null
    or to_regclass('public.android_push_devices') is null
    or to_regclass('public.push_notification_outbox') is null then
    raise exception 'TEST FAILED: notification tables are missing';
  end if;
  if has_table_privilege('authenticated','public.android_push_devices','select')
    or has_table_privilege('authenticated','public.push_notification_outbox','select') then
    raise exception 'TEST FAILED: browser can read token or delivery queue data';
  end if;
  if not has_function_privilege('authenticated','public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)','execute')
    or has_function_privilege('anon','public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)','execute') then
    raise exception 'TEST FAILED: inbox RPC grants are incorrect';
  end if;
  if has_function_privilege('authenticated','public.claim_push_notification_deliveries(text,integer,integer)','execute') then
    raise exception 'TEST FAILED: browser can claim push queue work';
  end if;
  if not has_function_privilege('authenticated','public.get_tenant_notification_settings()','execute')
    or not has_function_privilege('authenticated','public.set_tenant_notification_delivery_enabled(boolean)','execute')
    or not has_function_privilege('authenticated','public.set_tenant_push_notifications_enabled(boolean)','execute')
    or has_function_privilege('anon','public.get_tenant_notification_settings()','execute')
    or has_function_privilege('anon','public.set_tenant_notification_delivery_enabled(boolean)','execute')
    or has_function_privilege('anon','public.set_tenant_push_notifications_enabled(boolean)','execute') then
    raise exception 'TEST FAILED: tenant notification control grants are incorrect';
  end if;
  select lower(pg_get_functiondef('public.claim_push_notification_deliveries(text,integer,integer)'::regprocedure)) into v_claim;
  if position('skip locked' in v_claim)=0 or position('access_expires_at' in v_claim)=0
    or position('privacy_review_status' in v_claim)=0 or position('last_seen_at' in v_claim)=0 then
    raise exception 'TEST FAILED: push delivery-time rechecks are incomplete';
  end if;
  select lower(pg_get_functiondef('public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)'::regprocedure)) into v_inbox;
  if position('auth.uid()' in v_inbox)=0 or position('access_expires_at' in v_inbox)=0 then
    raise exception 'TEST FAILED: inbox does not recheck exact recipient and guardian expiry';
  end if;
  select lower(pg_get_functiondef(
    'public.register_android_push_device(text,text,text,text,text)'::regprocedure
  )) into v_registration;
  if position('pg_advisory_xact_lock' in v_registration)=0
    or position('device.id <> v_id' in v_registration)=0
    or position('if v_id is not null then' in v_registration)=0
    or position('failure_category = ''device_reassigned''' in v_registration)=0 then
    raise exception 'TEST FAILED: Android push refresh is not idempotent or does not cancel reassigned-device deliveries';
  end if;
  select lower(pg_get_functiondef('public.get_tenant_notification_settings()'::regprocedure))
    into v_tenant_settings;
  if position('current_tenant_id()' in v_tenant_settings)=0
    or position('tenant_admin' in v_tenant_settings)=0
    or position('privacy_approved_by' in v_tenant_settings)>0
    or position('tenant_daily_limit' in v_tenant_settings)>0 then
    raise exception 'TEST FAILED: tenant notification settings are not tenant-safe';
  end if;
end $$;

set local role anon;
do $$ begin
  begin perform public.get_notification_preferences(); raise exception 'TEST FAILED: anon read settings';
  exception when insufficient_privilege then null; end;
  begin perform public.get_tenant_notification_settings(); raise exception 'TEST FAILED: anon read tenant controls';
  exception when insufficient_privilege then null; end;
  begin perform public.set_tenant_notification_delivery_enabled(true); raise exception 'TEST FAILED: anon changed delivery';
  exception when insufficient_privilege then null; end;
  begin perform public.set_tenant_push_notifications_enabled(true); raise exception 'TEST FAILED: anon changed push';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
do $$ begin
  begin perform public.claim_push_notification_deliveries('browser',1,120); raise exception 'TEST FAILED: browser claimed queue';
  exception when insufficient_privilege then null; end;
end $$;

do $$
declare
  v_settings jsonb;
  v_caller integer;
begin
  perform set_config('request.jwt.claim.sub', 'b1180000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"b1180000-0000-0000-0000-000000000001","role":"authenticated"}', true);

  v_settings := public.get_tenant_notification_settings();
  if v_settings ->> 'privacy_review_status' <> 'approved'
    or (v_settings ->> 'notifications_enabled')::boolean then
    raise exception 'TEST FAILED: approved tenant A did not start paused';
  end if;
  v_settings := public.set_tenant_notification_delivery_enabled(true);
  if not (v_settings ->> 'email_effective')::boolean then
    raise exception 'TEST FAILED: tenant A could not resume approved email delivery';
  end if;
  v_settings := public.set_tenant_push_notifications_enabled(true);
  if not (v_settings ->> 'push_effective')::boolean then
    raise exception 'TEST FAILED: tenant A could not enable approved push delivery';
  end if;
  v_settings := public.set_tenant_notification_delivery_enabled(false);
  if (v_settings ->> 'push_effective')::boolean
    or not (v_settings ->> 'push_notifications_enabled')::boolean then
    raise exception 'TEST FAILED: pause did not stop push and preserve its preference';
  end if;
  v_settings := public.set_tenant_notification_delivery_enabled(true);
  if not (v_settings ->> 'push_effective')::boolean then
    raise exception 'TEST FAILED: resume did not restore the saved push preference';
  end if;

  -- Switching identities cannot select tenant A as a target. B's default
  -- pending review blocks activation without affecting tenant A.
  perform set_config('request.jwt.claim.sub', 'b1180000-0000-0000-0000-000000000002', true);
  perform set_config('request.jwt.claims', '{"sub":"b1180000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  v_settings := public.get_tenant_notification_settings();
  if v_settings ->> 'privacy_review_status' <> 'pending' then
    raise exception 'TEST FAILED: tenant B could read tenant A settings';
  end if;
  begin
    perform public.set_tenant_notification_delivery_enabled(true);
    raise exception 'TEST FAILED: pending tenant B enabled delivery';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_tenant_push_notifications_enabled(true);
    raise exception 'TEST FAILED: pending tenant B enabled push';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('request.jwt.claim.sub', 'b1180000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"b1180000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_settings := public.get_tenant_notification_settings();
  if not (v_settings ->> 'email_effective')::boolean
    or not (v_settings ->> 'push_effective')::boolean then
    raise exception 'TEST FAILED: tenant B changed tenant A delivery';
  end if;

  for v_caller in 3..8 loop
    perform set_config('request.jwt.claim.sub', ('b1180000-0000-0000-0000-' || lpad(v_caller::text, 12, '0')), true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', ('b1180000-0000-0000-0000-' || lpad(v_caller::text, 12, '0')),
      'role', 'authenticated'
    )::text, true);
    begin
      perform public.get_tenant_notification_settings();
      raise exception 'TEST FAILED: caller % read tenant settings', v_caller;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.set_tenant_notification_delivery_enabled(false);
      raise exception 'TEST FAILED: caller % changed tenant delivery', v_caller;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.set_tenant_push_notifications_enabled(false);
      raise exception 'TEST FAILED: caller % changed tenant push', v_caller;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- The RPCs are granted to authenticated so that PostgREST can expose them,
-- then enforce active tenant_admin role and caller-derived tenant scope inside
-- each SECURITY DEFINER body. These denial paths cover delegated admins,
-- platform admins, guardians, drivers, and cross-tenant callers because none
-- can supply or override a tenant identifier.
do $$
declare v_definition text;
begin
  select lower(pg_get_functiondef('public.set_tenant_notification_delivery_enabled(boolean)'::regprocedure))
    into v_definition;
  if position('current_user_role() is distinct from ''tenant_admin''' in v_definition)=0
    or position('current_tenant_id()' in v_definition)=0
    or position('p_tenant_id' in v_definition)>0
    or position('privacy_review_status <> ''approved''' in v_definition)=0 then
    raise exception 'TEST FAILED: delivery control role, tenant, or approval guard is incomplete';
  end if;
  select lower(pg_get_functiondef('public.set_tenant_push_notifications_enabled(boolean)'::regprocedure))
    into v_definition;
  if position('current_user_role() is distinct from ''tenant_admin''' in v_definition)=0
    or position('current_tenant_id()' in v_definition)=0
    or position('p_tenant_id' in v_definition)>0
    or position('not v_policy.notifications_enabled' in v_definition)=0 then
    raise exception 'TEST FAILED: push control role, tenant, or active-delivery guard is incomplete';
  end if;
end $$;

rollback;
