-- Support contact writes introduced in 0107 emit these audit actions through
-- phase5_write_audit_event. Keep the append-only audit allowlist intact while
-- admitting the two support events so the surrounding write transaction can
-- commit.

alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (
  action in (
    'auth.login', 'auth.logout', 'auth.password_reset_requested',
    'auth.password_reset_completed', 'auth.password_changed',
    'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
    'auth.account_recovery', 'auth.recent_auth_required',
    'invitation.created', 'invitation.resent', 'invitation.cancelled',
    'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
    'invitation.revoked', 'invitation.expired',
    'role.changed', 'role.escalation_blocked',
    'guardian.student_link_created', 'guardian.student_link_removed',
    'driver.assignment_created', 'driver.assignment_removed',
    'student.record_accessed', 'data.exported',
    'tenant.suspended', 'tenant.reactivated', 'tenant.lifecycle_changed',
    'account.revoked', 'account.suspended', 'account.restored',
    'security.config_changed', 'rate_limit.exceeded', 'retention.deletion_run',
    'admin.invited', 'admin.activated', 'admin.deactivated',
    'admin.transferred', 'admin.recovered', 'admin.departed', 'admin.role_changed',
    'bulk_import.created', 'bulk_import.validated', 'bulk_import.committed',
    'bulk_import.rolled_back', 'bulk_import.invitations_queued', 'audit.searched',
    'billing.subscription_created', 'billing.subscription_updated',
    'billing.quantity_changed',
    'billing.cancellation_scheduled', 'billing.renewal_resumed',
    'billing.subscription_reconciled', 'billing.portal_opened',
    'school.created', 'school.updated', 'school.archived', 'school.restored',
    'bus.created', 'bus.details_updated',
    'platform_support.updated', 'tenant_support.updated'
  )
);
