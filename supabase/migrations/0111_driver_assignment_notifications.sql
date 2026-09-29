-- Driver assignment-only notification preferences and email delivery.
-- Generated with the Supabase CLI and normalized to this repository's sequential naming.

alter table public.guardian_notification_outbox
  add column recipient_profile_id uuid references public.profiles(id) on delete cascade;

update public.guardian_notification_outbox o
set recipient_profile_id = g.profile_id
from public.guardians g
where g.id = o.guardian_id
  and g.tenant_id = o.tenant_id;

alter table public.guardian_notification_outbox
  alter column guardian_id drop not null;

alter table public.guardian_notification_outbox
  drop constraint guardian_notification_outbox_type_check;

alter table public.guardian_notification_outbox
  add constraint guardian_notification_outbox_type_check check (notification_type in (
    'student_picked_up',
    'student_dropped_off',
    'guardian_pickup_recorded',
    'guardian_dropoff_recorded',
    'guardian_trip_started',
    'guardian_trip_completed',
    'guardian_trip_cancelled',
    'guardian_trip_delayed',
    'guardian_trip_disrupted',
    'guardian_service_change',
    'driver_assignment_created',
    'driver_assignment_changed',
    'driver_assignment_ended'
  ));

comment on column public.guardian_notification_outbox.recipient_profile_id is
  'Authenticated recipient profile. Backfilled for guardian rows and required by generic service RPCs.';
comment on table public.guardian_notification_outbox is
  'Durable recipient-profile email outbox. The legacy name is retained for guardian rollout compatibility.';

create index guardian_notification_outbox_recipient_profile_idx
  on public.guardian_notification_outbox(recipient_profile_id, status, available_at);
create unique index guardian_notification_outbox_recipient_notification_unique
  on public.guardian_notification_outbox(
    tenant_id, recipient_profile_id, user_notification_id, notification_type
  ) where user_notification_id is not null;

alter function safebus_private.guardian_email_outbox_is_eligible(uuid)
  rename to guardian_email_outbox_is_eligible_legacy;

create function safebus_private.notification_email_outbox_is_eligible(p_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select safebus_private.guardian_email_outbox_is_eligible_legacy(p_outbox_id)
  or exists (
    select 1
    from public.guardian_notification_outbox o
    join public.user_notifications n
      on n.id = o.user_notification_id
     and n.tenant_id = o.tenant_id
     and n.recipient_profile_id = o.recipient_profile_id
     and n.recipient_role = 'driver'::public.user_role
     and n.category = 'assignments'
     and n.event_type = o.notification_type
    join public.profiles p
      on p.id = o.recipient_profile_id
     and p.tenant_id = o.tenant_id
     and p.role = 'driver'::public.user_role
     and p.status = 'active'
    join public.drivers d
      on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
    join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
    join public.user_notification_category_preferences c
      on c.profile_id = p.id and c.category = 'assignments' and c.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = p.tenant_id
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    where o.id = p_outbox_id
      and o.guardian_id is null
      and o.notification_type in (
        'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
      )
  );
$$;

create function safebus_private.guardian_email_outbox_is_eligible(p_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select safebus_private.notification_email_outbox_is_eligible(p_outbox_id);
$$;

revoke all on function safebus_private.guardian_email_outbox_is_eligible_legacy(uuid),
  safebus_private.notification_email_outbox_is_eligible(uuid),
  safebus_private.guardian_email_outbox_is_eligible(uuid)
  from public, anon, authenticated;

create or replace function public.get_driver_delivery_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.user_notification_settings%rowtype;
  v_category public.user_notification_category_preferences%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and role = 'driver' and status = 'active';

  if not found or not exists (
    select 1 from public.drivers d
    where d.profile_id = v_profile.id and d.tenant_id = v_profile.tenant_id and d.status = 'active'
  ) then
    raise exception 'Active driver access required' using errcode = '42501';
  end if;

  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
  values (v_profile.id, v_profile.tenant_id, false, false)
  on conflict (profile_id) do nothing;

  insert into public.user_notification_category_preferences(
    profile_id, category, push_enabled, email_enabled
  ) values (v_profile.id, 'assignments', false, false)
  on conflict (profile_id, category) do nothing;

  select * into v_settings from public.user_notification_settings where profile_id = v_profile.id;
  select * into v_category from public.user_notification_category_preferences
    where profile_id = v_profile.id and category = 'assignments';

  return jsonb_build_object(
    'push_enabled', v_settings.push_enabled,
    'email_enabled', v_settings.email_enabled,
    'assignment_alerts', jsonb_build_object(
      'push', v_category.push_enabled,
      'email', v_category.email_enabled
    )
  );
end;
$$;

create or replace function public.set_driver_delivery_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_assignment jsonb := p_preferences -> 'assignment_alerts';
begin
  if jsonb_typeof(p_preferences) <> 'object'
    or jsonb_typeof(p_preferences -> 'push_enabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'email_enabled') <> 'boolean'
    or jsonb_typeof(v_assignment) <> 'object'
    or jsonb_typeof(v_assignment -> 'push') <> 'boolean'
    or jsonb_typeof(v_assignment -> 'email') <> 'boolean' then
    raise exception 'Invalid driver delivery preferences' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and role = 'driver' and status = 'active';

  if not found or not exists (
    select 1 from public.drivers d
    where d.profile_id = v_profile.id and d.tenant_id = v_profile.tenant_id and d.status = 'active'
  ) then
    raise exception 'Active driver access required' using errcode = '42501';
  end if;

  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
  values (
    v_profile.id,
    v_profile.tenant_id,
    (p_preferences ->> 'push_enabled')::boolean,
    (p_preferences ->> 'email_enabled')::boolean
  )
  on conflict (profile_id) do update set
    push_enabled = excluded.push_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();

  insert into public.user_notification_category_preferences(
    profile_id, category, push_enabled, email_enabled
  ) values (
    v_profile.id,
    'assignments',
    (v_assignment ->> 'push')::boolean,
    (v_assignment ->> 'email')::boolean
  )
  on conflict (profile_id, category) do update set
    push_enabled = excluded.push_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();

  update public.user_notification_category_preferences
  set push_enabled = false, email_enabled = false, updated_at = now()
  where profile_id = v_profile.id and category <> 'assignments';

  return public.get_driver_delivery_preferences();
end;
$$;

revoke all on function public.get_driver_delivery_preferences() from public, anon;
revoke all on function public.set_driver_delivery_preferences(jsonb) from public, anon;
grant execute on function public.get_driver_delivery_preferences() to authenticated;
grant execute on function public.set_driver_delivery_preferences(jsonb) to authenticated;

-- Existing non-assignment driver rows are retained for audit, but removed from the active inbox.
update public.user_notifications n
set archived_at = coalesce(n.archived_at, now())
where n.recipient_role = 'driver'
  and (n.category <> 'assignments' or n.event_type not in (
    'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
  ));

update public.push_notification_outbox p
set status = 'cancelled',
    cancelled_at = coalesce(p.cancelled_at, now()),
    failure_category = coalesce(p.failure_category, 'driver_assignment_only'),
    updated_at = now()
where p.notification_id in (
  select n.id from public.user_notifications n
  where n.recipient_role = 'driver'
    and (n.category <> 'assignments' or n.event_type not in (
      'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
    ))
)
and p.status in ('pending', 'processing', 'retry');

update public.user_notification_category_preferences pref
set push_enabled = false, email_enabled = false, updated_at = now()
where pref.category <> 'assignments'
  and exists (
    select 1 from public.profiles p
    where p.id = pref.profile_id and p.role = 'driver'
  );

create or replace function safebus_private.enforce_driver_assignment_only_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_role = 'driver'::public.user_role
    and (
      new.category <> 'assignments'
      or new.event_type not in (
        'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
      )
      or not exists (
        select 1
        from public.profiles p
        join public.drivers d
          on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
        where p.id = new.recipient_profile_id
          and p.tenant_id = new.tenant_id
          and p.role = 'driver'::public.user_role
          and p.status = 'active'
      )
    ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_driver_assignment_only_notification on public.user_notifications;
create trigger enforce_driver_assignment_only_notification
before insert on public.user_notifications
for each row execute function safebus_private.enforce_driver_assignment_only_notification();

revoke all on function safebus_private.enforce_driver_assignment_only_notification()
  from public, anon, authenticated;

create or replace function safebus_private.driver_can_access_notification(p_notification public.user_notifications)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role <> 'driver' then true
    else p_notification.category = 'assignments'
      and p_notification.event_type in (
        'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
      )
      and exists (
        select 1 from public.drivers d
        where d.profile_id = p.id
          and d.tenant_id = p.tenant_id
          and d.status = 'active'
      )
  end
  from public.profiles p
  where p.id = (select auth.uid())
    and p.id = p_notification.recipient_profile_id
    and p.tenant_id = p_notification.tenant_id
    and p.role = p_notification.recipient_role
    and p.status = 'active';
$$;

revoke all on function safebus_private.driver_can_access_notification(public.user_notifications) from public, anon, authenticated;

drop policy if exists user_notifications_recipient_select on public.user_notifications;
drop policy if exists "user notifications select own authorized" on public.user_notifications;
create policy user_notifications_recipient_select
on public.user_notifications for select to authenticated
using (
  recipient_profile_id = (select auth.uid())
  and safebus_private.driver_can_access_notification(user_notifications)
  and (
    student_id is null
    or exists (
      select 1
      from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id
      where g.profile_id = (select auth.uid())
        and sg.student_id = user_notifications.student_id
        and sg.status = 'active'
        and g.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    )
  )
);

create or replace function public.get_user_notifications(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_unread_only boolean default false,
  p_category text default null
) returns table(
  id uuid, event_type text, category text, severity text, title text, body text,
  occurred_at timestamptz, created_at timestamptz, read_at timestamptz,
  archived_at timestamptz, destination_path text
) language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  ) then
    raise exception 'Active authentication is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields are required.' using errcode = '22023';
  end if;

  return query
  select n.id, n.event_type, n.category, n.severity,
    case n.event_type
      when 'driver_assignment_created' then 'Assignment created'
      when 'driver_assignment_changed' then 'Assignment changed'
      when 'driver_assignment_ended' then 'Assignment ended'
      when 'student_picked_up' then 'Pickup recorded'
      when 'student_dropped_off' then 'Drop-off recorded'
      when 'trip_started' then 'Trip started'
      when 'trip_completed' then 'Trip completed'
      when 'trip_cancelled' then 'Trip cancelled'
      else 'BusSafe update' end,
    case when n.category = 'assignments'
      then 'Your planned work assignment has changed.'
      else 'A BusSafe update is available.' end,
    n.occurred_at, n.created_at, n.read_at, n.archived_at,
    '/notifications?notification=' || n.id::text
  from public.user_notifications n
  where n.recipient_profile_id = (select auth.uid())
    and n.archived_at is null
    and safebus_private.driver_can_access_notification(n)
    and (not coalesce(p_unread_only, false) or n.read_at is null)
    and (p_category is null or n.category = p_category)
    and (p_before_created_at is null or (n.created_at, n.id) < (p_before_created_at, p_before_id))
    and (n.student_id is null or exists (
      select 1 from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
      where g.profile_id = (select auth.uid())
        and sg.student_id = n.student_id
        and sg.status = 'active'
        and g.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    ))
  order by n.created_at desc, n.id desc limit p_limit;
end;
$$;

create or replace function public.get_user_notification_unread_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.user_notifications n
  where n.recipient_profile_id = (select auth.uid())
    and n.read_at is null and n.archived_at is null
    and safebus_private.driver_can_access_notification(n)
    and (n.student_id is null or exists (
      select 1 from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
      where g.profile_id = (select auth.uid())
        and sg.student_id = n.student_id
        and sg.status = 'active' and g.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    ));
$$;

create or replace function public.mark_user_notifications_read(p_ids uuid[], p_read boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then
    raise exception 'Invalid notification selection.' using errcode = '22023';
  end if;
  update public.user_notifications n
  set read_at = case when coalesce(p_read, true) then coalesce(n.read_at, now()) else null end
  where n.recipient_profile_id = (select auth.uid())
    and n.id = any(coalesce(p_ids, '{}'::uuid[]))
    and safebus_private.driver_can_access_notification(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_all_user_notifications_read()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  update public.user_notifications n set read_at = now()
  where n.recipient_profile_id = (select auth.uid())
    and n.read_at is null and n.archived_at is null
    and safebus_private.driver_can_access_notification(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.archive_user_notifications(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then
    raise exception 'Invalid notification selection.' using errcode = '22023';
  end if;
  update public.user_notifications n set archived_at = coalesce(n.archived_at, now())
  where n.recipient_profile_id = (select auth.uid())
    and n.id = any(coalesce(p_ids, '{}'::uuid[]))
    and safebus_private.driver_can_access_notification(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Generic email service resolution keeps all operational details out of driver copy.
create or replace function public.enforce_guardian_notification_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
    if v_profile_id is null then return null; end if;
    new.recipient_profile_id := v_profile_id;
    return new;
  end if;

  if new.recipient_profile_id is null
    or new.notification_type not in (
      'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
    )
    or not exists (
      select 1
      from public.profiles p
      join public.drivers d
        on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.category = 'assignments' and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.notifications_enabled
       and policy.privacy_review_status = 'approved'
       and policy.privacy_approved_at is not null
      join public.user_notifications n
        on n.id = new.user_notification_id
       and n.recipient_profile_id = p.id
       and n.tenant_id = p.tenant_id
       and n.category = 'assignments'
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
$$;

revoke all on function public.enforce_guardian_notification_enqueue()
  from public, anon, authenticated;

create or replace function safebus_private.enqueue_driver_assignment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_role = 'driver'
    and new.category = 'assignments'
    and new.event_type in (
      'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
    )
    and exists (
      select 1
      from public.profiles p
      join public.drivers d on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.category = 'assignments' and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.notifications_enabled
       and policy.privacy_review_status = 'approved'
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
$$;

drop trigger if exists driver_assignment_email_enqueue on public.user_notifications;
create trigger driver_assignment_email_enqueue
after insert on public.user_notifications
for each row execute function safebus_private.enqueue_driver_assignment_email();

revoke all on function safebus_private.enqueue_driver_assignment_email() from public, anon, authenticated;
revoke all on table public.guardian_notification_outbox from public, anon, authenticated;

create or replace function public.resolve_notification_email_recipient(p_outbox_id uuid)
returns table(
  recipient_profile_id uuid,
  recipient_role text,
  recipient_email text,
  notification_type text,
  idempotency_key text
)
language sql
security definer
set search_path = ''
as $$
  select
    o.recipient_profile_id,
    p.role::text,
    p.email,
    o.notification_type,
    case
      when o.guardian_id is not null then 'guardian-notification-outbox:' || o.id::text
      else 'notification-email-outbox:' || o.id::text
    end
  from public.guardian_notification_outbox o
  join public.profiles p on p.id = o.recipient_profile_id and p.tenant_id = o.tenant_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and safebus_private.notification_email_outbox_is_eligible(o.id)
    and p.status = 'active'
    and (
      (p.role = 'guardian' and o.guardian_id is not null)
      or (
        p.role = 'driver'
        and o.guardian_id is null
        and o.notification_type in (
          'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
        )
        and exists (
          select 1 from public.drivers d
          where d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
        )
      )
    );
$$;

revoke all on function public.resolve_notification_email_recipient(uuid) from public, anon, authenticated;
grant execute on function public.resolve_notification_email_recipient(uuid) to service_role;

create or replace function public.claim_notification_email_batch(
  p_batch_size integer default 25,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5,
  p_provider_limit_per_minute integer default 50
) returns table(
  id uuid,
  tenant_id uuid,
  recipient_profile_id uuid,
  notification_type text,
  attempt_count integer
)
language sql
security definer
set search_path = ''
as $$
  select claimed.id, claimed.tenant_id, o.recipient_profile_id,
    claimed.notification_type, claimed.attempt_count
  from public.claim_guardian_notification_email_batch(
    p_batch_size, p_lease_seconds, p_max_attempts, p_provider_limit_per_minute
  ) claimed
  join public.guardian_notification_outbox o on o.id = claimed.id;
$$;

create or replace function public.complete_notification_email(
  p_outbox_id uuid, p_provider_message_id text default null
) returns void language sql security definer set search_path = '' as $$
  select public.complete_guardian_notification_email(p_outbox_id, p_provider_message_id);
$$;

create or replace function public.retry_notification_email(
  p_outbox_id uuid,
  p_failure_category text,
  p_failure_reason text,
  p_retry_after_seconds integer,
  p_max_attempts integer default 5
) returns void language sql security definer set search_path = '' as $$
  select public.retry_guardian_notification_email(
    p_outbox_id, p_failure_category, p_failure_reason, p_retry_after_seconds, p_max_attempts
  );
$$;

create or replace function public.fail_notification_email(
  p_outbox_id uuid, p_failure_category text, p_failure_reason text
) returns void language sql security definer set search_path = '' as $$
  select public.fail_guardian_notification_email(
    p_outbox_id, p_failure_category, p_failure_reason
  );
$$;

create or replace function public.cancel_notification_email(
  p_outbox_id uuid, p_failure_category text, p_failure_reason text
) returns void language sql security definer set search_path = '' as $$
  select public.cancel_guardian_notification_email(
    p_outbox_id, p_failure_category, p_failure_reason
  );
$$;

create or replace function public.requeue_notification_email_dead_letter(p_outbox_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select public.requeue_guardian_notification_dead_letter(p_outbox_id);
$$;

revoke all on function public.claim_notification_email_batch(integer, integer, integer, integer),
  public.complete_notification_email(uuid, text),
  public.retry_notification_email(uuid, text, text, integer, integer),
  public.fail_notification_email(uuid, text, text),
  public.cancel_notification_email(uuid, text, text),
  public.requeue_notification_email_dead_letter(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_notification_email_batch(integer, integer, integer, integer),
  public.complete_notification_email(uuid, text),
  public.retry_notification_email(uuid, text, text, integer, integer),
  public.fail_notification_email(uuid, text, text),
  public.cancel_notification_email(uuid, text, text),
  public.requeue_notification_email_dead_letter(uuid)
  to service_role;

-- Keep grants explicit so the reviewed authorization-surface parser can audit each RPC.
grant execute on function public.complete_notification_email(uuid, text) to service_role;
grant execute on function public.retry_notification_email(uuid, text, text, integer, integer) to service_role;
grant execute on function public.fail_notification_email(uuid, text, text) to service_role;
grant execute on function public.cancel_notification_email(uuid, text, text) to service_role;
grant execute on function public.requeue_notification_email_dead_letter(uuid) to service_role;

-- Backfill after the compatibility trigger/function surface remains available.
alter table public.guardian_notification_outbox
  alter column recipient_profile_id set not null;
