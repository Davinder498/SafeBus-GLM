-- Phase 7 native tracking authorization regression.
-- Run only against an approved isolated Supabase test database after applying
-- migrations through 0090. Never run this fixture against production.
begin;

do $$
declare
  v_signature text;
begin
  if to_regclass('public.driver_tracking_devices') is null then
    raise exception 'PHASE7 FAIL: driver_tracking_devices is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.driver_tracking_devices'::regclass) then
    raise exception 'PHASE7 FAIL: device table RLS is disabled';
  end if;
  if has_table_privilege('authenticated', 'public.driver_tracking_devices', 'SELECT')
    or has_table_privilege('authenticated', 'public.driver_tracking_devices', 'INSERT')
    or has_table_privilege('authenticated', 'public.driver_tracking_devices', 'UPDATE')
    or has_table_privilege('authenticated', 'public.driver_tracking_devices', 'DELETE') then
    raise exception 'PHASE7 FAIL: authenticated has direct device-table access';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.driver_trip_location_updates'::regclass
      and tgname = 'enforce_native_ingestion_for_bound_session'
      and not tgisinternal
  ) then
    raise exception 'PHASE7 FAIL: device-bound legacy-ingestion guard is missing';
  end if;

  foreach v_signature in array array[
    'public.register_android_byod_tracking_device(uuid,text,text,text)',
    'public.revoke_driver_tracking_devices(uuid)',
    'public.bind_driver_tracking_device(text,uuid,text)',
    'public.ingest_driver_location_event(text,text,uuid,bigint,timestamp with time zone,double precision,double precision,double precision,double precision,double precision,integer,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'PHASE7 FAIL: missing RPC %', v_signature;
    end if;
    if has_function_privilege('public', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE')
      or not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'PHASE7 FAIL: unsafe execute grants on %', v_signature;
    end if;
  end loop;
  if to_regprocedure('public.register_android_tracking_device(uuid,text,text,text)') is not null then
    raise exception 'PHASE7 FAIL: legacy company-device registration remains in the public API';
  end if;
  if to_regprocedure(
    'safebus_private.register_android_tracking_device(uuid,text,text,text)'
  ) is null then
    raise exception 'PHASE7 FAIL: legacy company-device registration was not quarantined';
  end if;
end $$;

insert into public.tenants(id, name, type, status)
values ('a7000000-0000-0000-0000-000000000001', 'Phase 7 Tracking Test', 'demo', 'active');

insert into auth.users(id, email, aud, role, email_confirmed_at, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a7000000-0000-0000-0000-000000000011', 'phase7.a@example.test', 'authenticated', 'authenticated', now(),
   '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a7000000-0000-0000-0000-000000000012', 'phase7.b@example.test', 'authenticated', 'authenticated', now(),
   '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles(id, tenant_id, full_name, first_name, last_name, email, role, status)
values
  ('a7000000-0000-0000-0000-000000000011', 'a7000000-0000-0000-0000-000000000001',
   'Phase Seven A', 'Phase', 'Seven A', 'phase7.a@example.test', 'driver', 'active'),
  ('a7000000-0000-0000-0000-000000000012', 'a7000000-0000-0000-0000-000000000001',
   'Phase Seven B', 'Phase', 'Seven B', 'phase7.b@example.test', 'driver', 'active');

insert into public.drivers(id, tenant_id, profile_id, status)
values
  ('a7000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000001',
   'a7000000-0000-0000-0000-000000000011', 'active'),
  ('a7000000-0000-0000-0000-000000000022', 'a7000000-0000-0000-0000-000000000001',
   'a7000000-0000-0000-0000-000000000012', 'active');

insert into public.driver_tracking_devices(
  id, tenant_id, driver_id, profile_id, installation_id, credential_hash,
  platform, ownership, app_version, privacy_notice_version,
  privacy_notice_acknowledged_at, status
) values (
  'a7000000-0000-0000-0000-000000000031',
  'a7000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000021',
  'a7000000-0000-0000-0000-000000000011',
  'a7000000-0000-0000-0000-000000000041',
  public.hash_driver_device_credential('sbus_device_v1_' || repeat('A', 43)),
  'android', 'personal', '1.0-test', 'driver-location-byod-v1', now(), 'active'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'a7000000-0000-0000-0000-000000000012',
  'role', 'authenticated'
)::text, true);

do $$
begin
  begin
    perform public.register_android_byod_tracking_device(
      'a7000000-0000-0000-0000-000000000041', 'forged device', '1.0-test',
      'driver-location-byod-v1'
    );
    raise exception 'PHASE7 FAIL: driver B claimed driver A device';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ingest_driver_location_event(
      'sbus_track_v1_' || repeat('B', 43),
      'sbus_device_v1_' || repeat('A', 43),
      gen_random_uuid(), 1, now(), 53.5461, -113.4937,
      10, 0, 0, 80, 'cellular'
    );
    raise exception 'PHASE7 FAIL: cross-driver location event was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', json_build_object(
  'sub', 'a7000000-0000-0000-0000-000000000011',
  'role', 'authenticated'
)::text, true);

do $$
begin
  begin
    perform public.register_android_byod_tracking_device(
      'a7000000-0000-0000-0000-000000000042', 'test phone', '1.0-test',
      'outdated-notice'
    );
    raise exception 'PHASE7 FAIL: outdated privacy notice was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.register_android_byod_tracking_device(
      'a7000000-0000-0000-0000-000000000042', 'test phone', '1.0-test', null
    );
    raise exception 'PHASE7 FAIL: missing privacy notice was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ingest_driver_location_event(
      'sbus_track_v1_' || repeat('B', 43),
      'sbus_device_v1_' || repeat('Z', 43),
      gen_random_uuid(), 1, now(), 53.5461, -113.4937,
      10, 0, 0, 80, 'cellular'
    );
    raise exception 'PHASE7 FAIL: forged device credential was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
