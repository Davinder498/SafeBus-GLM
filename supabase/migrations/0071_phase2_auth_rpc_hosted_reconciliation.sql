-- SafeBus Alberta - Phase 2 hosted auth-RPC reconciliation
--
-- Hosted DEV validation found that record_own_auth_event(text,text,jsonb) was
-- absent even though the surrounding 0068 objects were present. Recreate the
-- narrow self-service wrapper forward-only; do not expose write_audit_event().

create or replace function public.record_own_auth_event(
  p_action text,
  p_outcome text default 'success',
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.audit_events;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_action not in (
    'auth.login', 'auth.logout', 'auth.password_reset_completed',
    'auth.password_changed', 'auth.mfa_enrolled', 'auth.mfa_removed',
    'auth.mfa_challenge_failed', 'auth.account_recovery'
  ) then
    raise exception 'Unsupported self-service authentication audit action.'
      using errcode = '22023';
  end if;

  if p_outcome not in ('success', 'failure', 'denied', 'error') then
    raise exception 'Unsupported audit outcome.' using errcode = '22023';
  end if;

  if not public.check_rate_limit('audit_write', auth.uid()::text, 60, 60) then
    raise exception 'Authentication audit rate limit exceeded.' using errcode = '55000';
  end if;

  v_event := public.write_audit_event(
    p_action, null, null, null, p_outcome, p_detail, null
  );
  return v_event.id;
end;
$$;

revoke all on function public.record_own_auth_event(text, text, jsonb)
  from public, anon;
grant execute on function public.record_own_auth_event(text, text, jsonb)
  to authenticated;

-- Reassert that the generic writer remains internal after creating the narrow
-- SECURITY DEFINER wrapper.
revoke all on function public.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.record_own_auth_event(text,text,jsonb)') is null then
    raise exception '0071 assertion failed: record_own_auth_event is missing.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.record_own_auth_event(text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception '0071 assertion failed: authenticated cannot execute the narrow auth-event writer.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.write_audit_event(text,text,uuid,text,text,jsonb,inet)',
    'EXECUTE'
  ) then
    raise exception '0071 assertion failed: generic audit writer is browser-executable.';
  end if;
end
$$;

comment on function public.record_own_auth_event(text, text, jsonb) is
  'Narrow authenticated self-service audit wrapper. Only approved auth actions and outcomes are accepted; the generic writer remains internal.';
