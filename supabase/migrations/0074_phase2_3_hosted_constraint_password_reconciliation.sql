-- SafeBus Alberta - Hosted Phase 2/3 constraint and password reconciliation
--
-- Hosted DEV retained two older definitions after the Phase 2/3 migrations:
--   1. audit_events_action_check did not allow retention.deletion_run.
--   2. validate_password_policy(text) called repeat(text, text) while building
--      an incomplete repeated-character regular expression.
--
-- Reapply the canonical audit action allowlist and password validator. This is
-- forward-only and does not broaden browser table privileges.

alter table public.audit_events
  drop constraint if exists audit_events_action_check;

alter table public.audit_events
  add constraint audit_events_action_check check (
    action in (
      'auth.login', 'auth.logout', 'auth.password_reset_requested',
      'auth.password_reset_completed', 'auth.password_changed',
      'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
      'auth.account_recovery', 'auth.recent_auth_required',
      'invitation.created', 'invitation.resent', 'invitation.cancelled',
      'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
      'role.changed', 'role.escalation_blocked',
      'guardian.student_link_created', 'guardian.student_link_removed',
      'driver.assignment_created', 'driver.assignment_removed',
      'student.record_accessed',
      'data.exported',
      'tenant.suspended', 'tenant.reactivated',
      'account.revoked', 'account.suspended', 'account.restored',
      'security.config_changed',
      'rate_limit.exceeded',
      'retention.deletion_run'
    )
  ) not valid;

alter table public.audit_events
  validate constraint audit_events_action_check;

create or replace function public.validate_password_policy(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.password_policy;
begin
  select * into v_policy from public.password_policy where id = 1;

  if p_password is null or length(p_password) < v_policy.min_length or length(p_password) > 128 then return false; end if;
  if v_policy.require_uppercase and p_password !~ '[A-Z]' then return false; end if;
  if v_policy.require_lowercase and p_password !~ '[a-z]' then return false; end if;
  if v_policy.require_digit and p_password !~ '[0-9]' then return false; end if;
  if v_policy.require_special and p_password !~ '[^A-Za-z0-9]' then return false; end if;

  -- A limit of 3 permits three equal characters and rejects the fourth.
  if v_policy.max_repeating_char > 0
     and p_password ~ ('(.)\1{' || v_policy.max_repeating_char::text || ',}') then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.validate_password_policy(text) from public, anon;
grant execute on function public.validate_password_policy(text) to authenticated;

do $$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(c.oid)
  into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.audit_events'::regclass
    and c.conname = 'audit_events_action_check';

  if v_constraint is null or position('retention.deletion_run' in v_constraint) = 0 then
    raise exception '0074 assertion failed: retention audit action is not allowed.';
  end if;

  select pg_get_functiondef('public.validate_password_policy(text)'::regprocedure)
  into v_function;

  if position('repeat(' in lower(v_function)) > 0 then
    raise exception '0074 assertion failed: malformed hosted password validator remains.';
  end if;
end
$$;

comment on function public.validate_password_policy(text) is
  'Validates password length and configured character requirements, rejecting runs longer than max_repeating_char.';
