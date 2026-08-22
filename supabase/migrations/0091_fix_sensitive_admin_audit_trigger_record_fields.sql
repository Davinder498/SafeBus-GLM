-- SafeBus Alberta - fix audit trigger record field access
--
-- capture_sensitive_admin_audit() is attached to several tables. PL/pgSQL
-- record fields must only be accessed after narrowing to a table with that
-- column; otherwise a student_guardians INSERT can try to read NEW.role.

create or replace function public.capture_sensitive_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_target_type text := tg_table_name;
  v_target_id uuid;
  v_detail jsonb := '{}'::jsonb;
begin
  if current_setting('safebus.retention_run', true) = 'on' then
    return coalesce(new, old);
  end if;

  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name <> 'password_policy' then
    v_target_id := coalesce(new.id, old.id);
  end if;

  if tg_table_name = 'tenants' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case when new.status = 'active' then 'tenant.reactivated' else 'tenant.suspended' end;
    v_detail := jsonb_build_object('from_status', old.status, 'to_status', new.status);
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      v_action := 'role.changed';
      v_detail := jsonb_build_object('from_role', old.role, 'to_role', new.role);
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      v_action := case when new.status = 'active' then 'account.restored' else 'account.suspended' end;
      v_detail := jsonb_build_object('from_status', old.status, 'to_status', new.status);
    end if;
  elsif tg_table_name = 'student_guardians' then
    v_action := case
      when tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'active') then 'guardian.student_link_created'
      else 'guardian.student_link_removed'
    end;
  elsif tg_table_name = 'driver_route_assignments' then
    v_action := case
      when tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'active') then 'driver.assignment_created'
      else 'driver.assignment_removed'
    end;
  elsif tg_table_name = 'tenant_onboarding_invitations' then
    v_action := case
      when tg_op = 'INSERT' then 'invitation.created'
      when new.status = 'resent' then 'invitation.resent'
      when new.status = 'cancelled' then 'invitation.cancelled'
      when new.status = 'activated' then 'invitation.accepted'
      else null
    end;
  elsif tg_table_name in ('allowed_redirect_origins', 'password_policy') then
    v_action := 'security.config_changed';
    v_detail := jsonb_build_object('operation', lower(tg_op), 'configuration', tg_table_name);
  end if;

  if v_action is not null then
    perform public.write_audit_event(
      v_action, v_target_type, v_target_id, null, 'success', v_detail, null
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.capture_sensitive_admin_audit() from public, anon, authenticated;
