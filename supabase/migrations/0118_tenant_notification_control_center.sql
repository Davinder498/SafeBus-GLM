-- SafeBus Alberta - tenant notification control center
--
-- Tenant administrators may pause or resume privacy-approved external
-- notification delivery and control the Android push channel. Privacy review
-- fields and delivery limits remain platform-owned and are never accepted as
-- browser inputs.

-- The existing push dispatcher reads push_notifications_enabled directly.
-- Keep that operational flag false during a tenant-wide pause while retaining
-- the administrator's choice for the next resume.
alter table public.guardian_notification_delivery_policies
  add column push_delivery_preference_enabled boolean not null default false;

update public.guardian_notification_delivery_policies
set push_delivery_preference_enabled = push_notifications_enabled;

update public.guardian_notification_delivery_policies
set push_notifications_enabled = false
where not notifications_enabled and push_notifications_enabled;

create or replace function public.get_tenant_notification_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
  v_approved boolean;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  v_approved := v_policy.privacy_review_status = 'approved'
    and v_policy.privacy_approved_at is not null;

  return jsonb_build_object(
    'notifications_enabled', v_policy.notifications_enabled,
    'push_notifications_enabled', v_policy.push_delivery_preference_enabled,
    'email_effective', v_approved and v_policy.notifications_enabled,
    'push_effective', v_approved and v_policy.notifications_enabled
      and v_policy.push_notifications_enabled,
    'privacy_review_status', v_policy.privacy_review_status,
    'privacy_approved_at', v_policy.privacy_approved_at,
    'updated_at', v_policy.updated_at
  );
end;
$$;

create or replace function public.set_tenant_notification_delivery_enabled(
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id
  for update;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  if p_enabled is null then
    raise exception 'A delivery choice is required.' using errcode = '22023';
  end if;

  if p_enabled and (
    v_policy.privacy_review_status <> 'approved'
    or v_policy.privacy_approved_at is null
  ) then
    raise exception 'External notification delivery requires approved privacy review.'
      using errcode = '22023';
  end if;

  if v_policy.notifications_enabled is distinct from p_enabled
    or v_policy.push_notifications_enabled is distinct from
      (p_enabled and v_policy.push_delivery_preference_enabled) then
    update public.guardian_notification_delivery_policies
    set notifications_enabled = p_enabled,
        push_notifications_enabled = case
          when p_enabled then v_policy.push_delivery_preference_enabled
          else false
        end
    where tenant_id = v_tenant_id;

    perform public.phase5_write_audit_event(
      auth.uid(),
      'security.config_changed',
      'tenant_notification_policy',
      v_tenant_id,
      'Tenant notification delivery',
      jsonb_build_object(
        'setting', 'external_delivery',
        'previous_enabled', v_policy.notifications_enabled,
        'enabled', p_enabled
      )
    );
  end if;

  return public.get_tenant_notification_settings();
end;
$$;

create or replace function public.set_tenant_push_notifications_enabled(
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id
  for update;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  if p_enabled is null then
    raise exception 'A push delivery choice is required.' using errcode = '22023';
  end if;

  if v_policy.privacy_review_status <> 'approved'
    or v_policy.privacy_approved_at is null
    or not v_policy.notifications_enabled then
    raise exception 'Android push can only change while approved external delivery is active.'
      using errcode = '22023';
  end if;

  if v_policy.push_notifications_enabled is distinct from p_enabled
    or v_policy.push_delivery_preference_enabled is distinct from p_enabled then
    update public.guardian_notification_delivery_policies
    set push_notifications_enabled = p_enabled,
        push_delivery_preference_enabled = p_enabled
    where tenant_id = v_tenant_id;

    perform public.phase5_write_audit_event(
      auth.uid(),
      'security.config_changed',
      'tenant_notification_policy',
      v_tenant_id,
      'Tenant Android push delivery',
      jsonb_build_object(
        'setting', 'android_push',
        'previous_enabled', v_policy.push_delivery_preference_enabled,
        'enabled', p_enabled
      )
    );
  end if;

  return public.get_tenant_notification_settings();
end;
$$;

comment on function public.get_tenant_notification_settings() is
  'Returns the current tenant notification policy without approval identities, rate limits, or recipient data. Tenant admin only.';
comment on function public.set_tenant_notification_delivery_enabled(boolean) is
  'Pauses or resumes approved external notification delivery for the caller tenant without changing the saved push preference. Tenant admin only.';
comment on function public.set_tenant_push_notifications_enabled(boolean) is
  'Controls tenant Android push delivery while approved external delivery is active. Tenant admin only.';

revoke all on function public.get_tenant_notification_settings() from public, anon, authenticated;
revoke all on function public.set_tenant_notification_delivery_enabled(boolean) from public, anon, authenticated;
revoke all on function public.set_tenant_push_notifications_enabled(boolean) from public, anon, authenticated;

grant execute on function public.get_tenant_notification_settings() to authenticated;
grant execute on function public.set_tenant_notification_delivery_enabled(boolean) to authenticated;
grant execute on function public.set_tenant_push_notifications_enabled(boolean) to authenticated;
