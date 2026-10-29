CREATE OR REPLACE FUNCTION safebus_private.enforce_guardian_notification_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id uuid;
begin
  if new.guardian_id is not null then
    select g.profile_id into v_profile_id
    from public.guardians g
    join public.profiles p on p.id = g.profile_id and p.status = 'active'
    join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = g.tenant_id
     and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
     and policy.privacy_approved_at is not null
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
    if v_profile_id is null then return null; end if;
    new.recipient_profile_id := v_profile_id;
    return new;
  end if;

  if new.recipient_profile_id is null

    or not exists (
      select 1
      from public.profiles p
      join public.drivers d
        on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
       and policy.privacy_approved_at is not null
      join public.user_notifications n
        on n.id = new.user_notification_id
       and n.recipient_profile_id = p.id
       and n.tenant_id = p.tenant_id
       and n.category = c.category and safebus_private.driver_notification_is_eligible(n)
       and n.event_type = new.notification_type
      where p.id = new.recipient_profile_id
        and p.tenant_id = new.tenant_id
        and p.role = 'driver'::public.user_role
        and p.status = 'active'
    ) then
    return null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enqueue_driver_assignment_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.recipient_role = 'driver'
    and safebus_private.driver_notification_is_eligible(new)
    and exists (
      select 1
      from public.profiles p
      join public.drivers d on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.category = new.category and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
       and policy.privacy_approved_at is not null
      where p.id = new.recipient_profile_id and p.tenant_id = new.tenant_id
        and p.status = 'active'
    ) then
    insert into public.guardian_notification_outbox(
      tenant_id, recipient_profile_id, user_notification_id, notification_type
    ) values (new.tenant_id, new.recipient_profile_id, new.id, new.event_type)
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
CREATE TRIGGER guardian_notification_enqueue_authorization BEFORE INSERT ON public.guardian_notification_outbox FOR EACH ROW EXECUTE FUNCTION safebus_private.enforce_guardian_notification_enqueue();
CREATE TRIGGER driver_assignment_email_enqueue AFTER INSERT ON public.user_notifications FOR EACH ROW EXECUTE FUNCTION safebus_private.enqueue_driver_assignment_email();
CREATE TRIGGER user_notifications_enqueue_guardian_email AFTER INSERT ON public.user_notifications FOR EACH ROW EXECUTE FUNCTION safebus_private.enqueue_guardian_email_for_notification();
