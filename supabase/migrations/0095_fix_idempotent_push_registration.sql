-- SafeBus Alberta - preserve Android push registrations across token refreshes.
--
-- Migration 0092 revoked and replaced the active device row on every
-- registration callback, even when the installation and FCM token were
-- unchanged. Any delivery queued against that row then became ineligible
-- before the dispatcher could claim it. Refreshing an existing installation
-- is now idempotent and preserves the device id (and its queued deliveries).

create or replace function public.register_android_push_device(
  p_installation_id text,
  p_fcm_token text,
  p_device_model text,
  p_app_version text,
  p_permission_state text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.profiles;
  v_auth_id uuid := auth.uid();
  v_installation_id text := trim(coalesce(p_installation_id, ''));
  v_token text := trim(coalesce(p_fcm_token, ''));
  v_hash text;
  v_id uuid;
  v_revoked_device_ids uuid[] := '{}'::uuid[];
begin
  select *
  into v_profile
  from public.profiles
  where id = v_auth_id
    and status = 'active';

  if not found or v_profile.role not in ('guardian', 'driver') then
    raise exception 'Android push registration is unavailable.' using errcode = '42501';
  end if;

  if length(v_installation_id) not between 16 and 200
    or length(v_token) not between 20 and 4096
    or p_permission_state not in ('prompt', 'granted', 'denied', 'permanently_denied') then
    raise exception 'Invalid push registration.' using errcode = '22023';
  end if;

  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Serialize callbacks for the same app installation. Capacitor can emit
  -- more than one registration event during startup or resume.
  perform pg_advisory_xact_lock(
    hashtextextended('safebus:push-installation:' || v_installation_id, 0)
  );

  select device.id
  into v_id
  from public.android_push_devices device
  where device.profile_id = v_auth_id
    and device.installation_id = v_installation_id
    and device.status = 'active'
  for update;

  -- A token may move to another authenticated account on a shared device, or
  -- an installation may receive a replacement token. Revoke only conflicting
  -- active associations; never revoke the row selected for an idempotent
  -- refresh.
  with revoked as (
    update public.android_push_devices device
    set status = 'revoked',
        revoked_at = now()
    where device.status = 'active'
      and (v_id is null or device.id <> v_id)
      and (
        device.token_hash = v_hash
        or (
          device.profile_id = v_auth_id
          and device.installation_id = v_installation_id
        )
      )
    returning device.id
  )
  select coalesce(array_agg(revoked.id), '{}'::uuid[])
  into v_revoked_device_ids
  from revoked;

  if cardinality(v_revoked_device_ids) > 0 then
    update public.push_notification_outbox outbox
    set status = 'cancelled',
        cancelled_at = now(),
        failure_category = 'device_reassigned',
        lease_owner = null,
        lease_expires_at = null
    where outbox.device_id = any(v_revoked_device_ids)
      and outbox.status in ('pending', 'retry', 'processing');
  end if;

  if v_id is not null then
    update public.android_push_devices device
    set tenant_id = v_profile.tenant_id,
        fcm_token = v_token,
        token_hash = v_hash,
        device_model = nullif(trim(p_device_model), ''),
        app_version = nullif(trim(p_app_version), ''),
        permission_state = p_permission_state,
        last_registered_at = now(),
        last_seen_at = now(),
        revoked_at = null,
        invalidated_at = null,
        last_failure_category = null
    where device.id = v_id
    returning device.id into v_id;
  else
    insert into public.android_push_devices(
      tenant_id,
      profile_id,
      installation_id,
      fcm_token,
      token_hash,
      device_model,
      app_version,
      permission_state,
      status,
      last_registered_at,
      last_seen_at
    ) values (
      v_profile.tenant_id,
      v_profile.id,
      v_installation_id,
      v_token,
      v_hash,
      nullif(trim(p_device_model), ''),
      nullif(trim(p_app_version), ''),
      p_permission_state,
      'active',
      now(),
      now()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.register_android_push_device(text, text, text, text, text)
  from public, anon;
grant execute on function public.register_android_push_device(text, text, text, text, text)
  to authenticated;

comment on function public.register_android_push_device(text, text, text, text, text) is
  'Registers Android push idempotently. Same-account installation refreshes preserve the active device id; conflicting token associations are revoked and their unfinished deliveries cancelled.';
