-- A guardian changing their own alert choices is not granting student access.
-- Keep the original recent-auth gate for link creation, deletion, identity,
-- scope, expiry, status and every other access-bearing field.
create or replace function safebus_private.enforce_sensitive_admin_mutation()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if current_setting('safebus.retention_run', true) = 'on' then
    return coalesce(new, old);
  end if;
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Preserve the hosted first-account activation exception. Invited users
  -- must be able to finish their own onboarding before administrator MFA setup.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if new.id = auth.uid() and old.status = 'invited' and new.status = 'active'
       and new.role is not distinct from old.role then
      return new;
    end if;
  end if;

  perform safebus_private.enforce_mfa_if_required();

  if tg_table_name = 'student_guardians' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['can_receive_notifications', 'notify_pickup',
          'notify_dropoff', 'notification_preferences_set_at', 'updated_at'])
       is not distinct from
       (to_jsonb(old) - array['can_receive_notifications', 'notify_pickup',
          'notify_dropoff', 'notification_preferences_set_at', 'updated_at'])
       and public.is_current_user_session_active()
       and exists (
         select 1 from public.guardians g
         join public.profiles p on p.id = g.profile_id
         join public.tenants t on t.id = g.tenant_id
         where g.id = new.guardian_id and g.profile_id = auth.uid()
           and g.tenant_id = new.tenant_id and p.tenant_id = g.tenant_id
           and p.role = 'guardian' and p.status = 'active'
           and g.status = 'active' and t.status = 'active'
       ) then
      return new;
    end if;
  end if;

  if tg_table_name in ('tenants', 'profiles', 'student_guardians', 'password_policy') then
    perform safebus_private.enforce_recent_auth_for_sensitive_action();
  end if;
  return coalesce(new, old);
end;
$$;
-- Existing triggers and audit capture remain attached. No new RPC or grants.
revoke all on function safebus_private.enforce_sensitive_admin_mutation()
  from public, anon, authenticated;
