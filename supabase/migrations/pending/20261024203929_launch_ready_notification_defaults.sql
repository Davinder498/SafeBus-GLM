alter table public.guardian_notification_delivery_policies
  alter column privacy_review_status set default 'approved',
  alter column privacy_approved_at set default now(),
  alter column notifications_enabled set default true,
  alter column push_notifications_enabled set default true,
  alter column push_delivery_preference_enabled set default true;

comment on table public.guardian_notification_delivery_policies is
  'School authority notification availability under the owner-approved standard policy. New accounts are provisioned ready; personal consent, device permission, tenant scope, quiet hours and quotas still govern delivery.';

update public.guardian_notification_delivery_policies as policy
set privacy_review_status = 'approved',
    privacy_approved_at = now(),
    notifications_enabled = true,
    push_notifications_enabled = true,
    push_delivery_preference_enabled = true
where policy.tenant_id = 'a7033cbe-9bc7-4508-89bd-0a19270a2c15'::uuid
  and policy.privacy_review_status = 'pending'
  and policy.privacy_approved_at is null
  and policy.privacy_approved_by is null
  and not policy.notifications_enabled
  and not policy.push_notifications_enabled
  and not policy.push_delivery_preference_enabled
  and exists (
    select 1 from public.tenants as tenant
    where tenant.id = policy.tenant_id
      and tenant.name = 'Test School District'
      and tenant.status = 'active'
  );
