-- SafeBus Alberta - Phase 7 personal-device Android tracking
--
-- Replaces new company-device registration with a versioned BYOD contract.
-- Existing device rows remain valid so rollout and revocation can be managed,
-- while new SafeBus Android builds register only personally owned devices.

alter table public.driver_tracking_devices
  drop constraint driver_tracking_devices_ownership_check;

alter table public.driver_tracking_devices
  add column privacy_notice_version text,
  add column privacy_notice_acknowledged_at timestamptz,
  add constraint driver_tracking_devices_ownership_check
    check (ownership in ('company_owned', 'personal')),
  add constraint driver_tracking_devices_privacy_notice_check check (
    (privacy_notice_version is null and privacy_notice_acknowledged_at is null)
    or (
      ownership = 'personal'
      and privacy_notice_version is not null
      and char_length(privacy_notice_version) between 1 and 80
      and privacy_notice_acknowledged_at is not null
    )
  );

create or replace function public.register_android_byod_tracking_device(
  p_installation_id uuid,
  p_device_model text,
  p_app_version text,
  p_notice_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_driver_id uuid := public.current_driver_id();
  v_device public.driver_tracking_devices;
  v_credential text;
  v_hash text;
  v_existing boolean := false;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can register a tracking device.' using errcode = '42501';
  end if;
  if p_installation_id is null
    or p_notice_version is distinct from 'driver-location-byod-v1' then
    raise exception 'The current personal-device location notice must be acknowledged.'
      using errcode = '42501';
  end if;
  if p_app_version is null or char_length(trim(p_app_version)) not between 1 and 40
    or (p_device_model is not null and char_length(p_device_model) > 120) then
    raise exception 'Invalid tracking device metadata.' using errcode = '22023';
  end if;

  select d.* into v_device
  from public.driver_tracking_devices d
  where d.installation_id = p_installation_id
  for update;
  v_existing := found;

  if v_existing and (
    v_device.tenant_id is distinct from v_tenant_id
    or v_device.driver_id is distinct from v_driver_id
    or v_device.profile_id is distinct from auth.uid()
  ) then
    raise exception 'This device is registered to another driver.' using errcode = '42501';
  end if;

  loop
    v_credential := public.create_driver_device_credential();
    v_hash := public.hash_driver_device_credential(v_credential);
    exit when not exists (
      select 1 from public.driver_tracking_devices where credential_hash = v_hash
    );
  end loop;

  if v_existing then
    update public.driver_tracking_devices
    set credential_hash = v_hash,
        platform = 'android',
        ownership = 'personal',
        device_model = nullif(trim(p_device_model), ''),
        app_version = trim(p_app_version),
        privacy_notice_version = p_notice_version,
        privacy_notice_acknowledged_at = now(),
        status = 'active',
        revoked_at = null,
        registered_at = now()
    where id = v_device.id
    returning * into v_device;
  else
    insert into public.driver_tracking_devices(
      tenant_id, driver_id, profile_id, installation_id, credential_hash,
      platform, ownership, device_model, app_version,
      privacy_notice_version, privacy_notice_acknowledged_at
    ) values (
      v_tenant_id, v_driver_id, auth.uid(), p_installation_id, v_hash,
      'android', 'personal', nullif(trim(p_device_model), ''), trim(p_app_version),
      p_notice_version, now()
    ) returning * into v_device;
  end if;

  return jsonb_build_object(
    'deviceId', v_device.id,
    'installationId', v_device.installation_id,
    'deviceCredential', v_credential
  );
end;
$$;

-- Force installed company-device builds onto the reviewed BYOD registration
-- path. Existing device credentials are not silently revoked by this migration.
revoke execute on function public.register_android_tracking_device(uuid, text, text, text)
  from authenticated;
revoke all on function public.register_android_byod_tracking_device(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_android_byod_tracking_device(uuid, text, text, text)
  to authenticated;

comment on table public.driver_tracking_devices is
  'Android installations authorized for active-trip driver tracking. Personal devices require a versioned location-notice acknowledgment. Raw device credentials are never stored.';
comment on function public.register_android_byod_tracking_device(uuid, text, text, text) is
  'Registers an authenticated driver personal Android installation after the current active-trip background-location notice is acknowledged.';

create or replace function public.revoke_driver_tracking_devices(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_sessions integer;
begin
  if auth.uid() is null or public.current_user_role() <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can revoke driver tracking devices.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  if not exists (
    select 1
    from public.profiles p
    join public.drivers d on d.profile_id = p.id and d.tenant_id = p.tenant_id
    where p.id = p_profile_id
      and p.tenant_id = public.current_tenant_id()
      and p.role = 'driver'
  ) then
    raise exception 'Driver not found in your tenant.' using errcode = 'P0002';
  end if;

  update public.driver_tracking_devices
  set status = 'revoked', revoked_at = now()
  where profile_id = p_profile_id
    and tenant_id = public.current_tenant_id()
    and status = 'active';
  get diagnostics v_count = row_count;

  -- A lost unlocked phone could otherwise use its still-valid app session to
  -- re-register the installation. Revoke every driver refresh session too.
  v_sessions := public.revoke_all_user_sessions(p_profile_id);

  perform public.write_audit_event(
    'driver.tracking_devices_revoked',
    'profile', p_profile_id, null,
    'success',
    jsonb_build_object('devices_revoked', v_count, 'sessions_revoked', v_sessions)
  );
  return v_count;
end;
$$;

revoke all on function public.revoke_driver_tracking_devices(uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_driver_tracking_devices(uuid)
  to authenticated;

comment on function public.revoke_driver_tracking_devices(uuid) is
  'Revokes every active native tracking credential and SafeBus refresh session for a tenant-scoped driver. Tenant-admin only, MFA/recent-auth protected, and audited.';
