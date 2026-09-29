-- BusSafe Alberta - guardian channel preferences and durable email expansion
--
-- This migration is intentionally additive and fail-closed. The in-app inbox
-- remains authoritative; these preferences gate external push/email only.

alter table public.user_notification_settings
  add column email_enabled boolean not null default false;

alter table public.user_notification_category_preferences
  add column email_enabled boolean not null default false;

comment on column public.user_notification_settings.email_enabled is
  'Guardian account-level email delivery gate. Category choices are preserved while this gate is disabled.';
comment on column public.user_notification_category_preferences.email_enabled is
  'Per-category email selection. Effective delivery also requires the account master gate and current authorization.';

-- Preserve the only existing email choice. New trip and operational email
-- categories stay off until the guardian explicitly selects them.
insert into public.user_notification_settings(profile_id, tenant_id, email_enabled, updated_at)
select
  g.profile_id,
  g.tenant_id,
  g.pickup_dropoff_email_enabled and g.email_preferences_set_at is not null,
  now()
from public.guardians g
where g.status = 'active'
on conflict (profile_id) do update
set email_enabled = excluded.email_enabled,
    updated_at = excluded.updated_at;

insert into public.user_notification_category_preferences(
  profile_id, category, push_enabled, email_enabled, updated_at
)
select
  g.profile_id,
  category.name,
  coalesce(existing.push_enabled, false),
  case
    when category.name = 'pickup_dropoff'
      then g.pickup_dropoff_email_enabled and g.email_preferences_set_at is not null
    else false
  end,
  now()
from public.guardians g
cross join (values ('pickup_dropoff'), ('trip_status'), ('operations'), ('service_changes')) category(name)
left join public.user_notification_category_preferences existing
  on existing.profile_id = g.profile_id
 and existing.category = category.name
where g.status = 'active'
on conflict (profile_id, category) do update
set email_enabled = excluded.email_enabled,
    updated_at = excluded.updated_at;

-- Operational guardian push previously stopped at the per-student gate.
alter table public.guardian_student_push_preferences
  drop constraint guardian_student_push_preferences_category_check;
alter table public.guardian_student_push_preferences
  add constraint guardian_student_push_preferences_category_check check (
    category in ('pickup_dropoff', 'trip_status', 'service_changes', 'operations')
  );

insert into public.guardian_student_push_preferences(
  student_guardian_id, category, push_enabled, preferences_set_at, updated_at
)
select
  sg.id,
  'operations',
  coalesce(
    (select gp.push_enabled
     from public.guardian_student_push_preferences gp
     where gp.student_guardian_id = sg.id and gp.category = 'service_changes'),
    (select cp.push_enabled
     from public.guardians g
     join public.user_notification_category_preferences cp on cp.profile_id = g.profile_id
     where g.id = sg.guardian_id and cp.category = 'operations'),
    false
  ),
  now(),
  now()
from public.student_guardians sg
on conflict (student_guardian_id, category) do nothing;

update public.student_guardians sg
set can_receive_notifications = true,
    notification_preferences_set_at = coalesce(sg.notification_preferences_set_at, now()),
    updated_at = now()
where exists (
  select 1
  from public.guardian_student_push_preferences gp
  where gp.student_guardian_id = sg.id and gp.push_enabled
);

-- Versioned, atomic account preference snapshot.
create or replace function public.get_guardian_delivery_preferences_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_settings public.user_notification_settings;
begin
  select p.* into v_profile
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role = 'guardian'::public.user_role;
  if not found then
    raise exception 'Guardian delivery preferences require an active guardian login.'
      using errcode = '42501';
  end if;

  select g.* into v_guardian
  from public.guardians g
  where g.profile_id = v_profile.id
    and g.tenant_id = v_profile.tenant_id
    and g.status = 'active';
  if not found then
    raise exception 'Active guardian account not found.' using errcode = 'P0002';
  end if;

  insert into public.user_notification_settings(profile_id, tenant_id)
  values (v_profile.id, v_profile.tenant_id)
  on conflict (profile_id) do nothing;

  insert into public.user_notification_category_preferences(profile_id, category)
  values
    (v_profile.id, 'pickup_dropoff'),
    (v_profile.id, 'trip_status'),
    (v_profile.id, 'operations'),
    (v_profile.id, 'service_changes')
  on conflict (profile_id, category) do nothing;

  select s.* into v_settings
  from public.user_notification_settings s
  where s.profile_id = v_profile.id;

  return jsonb_build_object(
    'push_enabled', v_settings.push_enabled,
    'email_enabled', v_settings.email_enabled,
    'pickup_dropoff', jsonb_build_object(
      'push', coalesce((select cp.push_enabled from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category = 'pickup_dropoff'), false),
      'email', coalesce((select cp.email_enabled from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category = 'pickup_dropoff'), false)
    ),
    'trip_updates', jsonb_build_object(
      'push', coalesce((select cp.push_enabled from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category = 'trip_status'), false),
      'email', coalesce((select cp.email_enabled from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category = 'trip_status'), false)
    ),
    'operational_alerts', jsonb_build_object(
      'push', coalesce((select bool_and(cp.push_enabled) from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category in ('operations', 'service_changes')), false),
      'email', coalesce((select bool_and(cp.email_enabled) from public.user_notification_category_preferences cp
        where cp.profile_id = v_profile.id and cp.category in ('operations', 'service_changes')), false)
    )
  );
end;
$$;

create or replace function public.set_guardian_delivery_preferences_v2(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_push_master boolean;
  v_email_master boolean;
  v_pickup_push boolean;
  v_pickup_email boolean;
  v_trip_push boolean;
  v_trip_email boolean;
  v_operations_push boolean;
  v_operations_email boolean;
begin
  if jsonb_typeof(p_preferences) <> 'object'
    or jsonb_typeof(p_preferences -> 'push_enabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'email_enabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'pickup_dropoff') <> 'object'
    or jsonb_typeof(p_preferences #> '{pickup_dropoff,push}') <> 'boolean'
    or jsonb_typeof(p_preferences #> '{pickup_dropoff,email}') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'trip_updates') <> 'object'
    or jsonb_typeof(p_preferences #> '{trip_updates,push}') <> 'boolean'
    or jsonb_typeof(p_preferences #> '{trip_updates,email}') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'operational_alerts') <> 'object'
    or jsonb_typeof(p_preferences #> '{operational_alerts,push}') <> 'boolean'
    or jsonb_typeof(p_preferences #> '{operational_alerts,email}') <> 'boolean' then
    raise exception 'A complete guardian delivery preference snapshot is required.'
      using errcode = '22023';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role = 'guardian'::public.user_role;
  if not found then
    raise exception 'Guardian delivery preferences require an active guardian login.'
      using errcode = '42501';
  end if;

  select g.* into v_guardian
  from public.guardians g
  where g.profile_id = v_profile.id
    and g.tenant_id = v_profile.tenant_id
    and g.status = 'active'
  for update;
  if not found then
    raise exception 'Active guardian account not found.' using errcode = 'P0002';
  end if;

  v_push_master := (p_preferences ->> 'push_enabled')::boolean;
  v_email_master := (p_preferences ->> 'email_enabled')::boolean;
  v_pickup_push := (p_preferences #>> '{pickup_dropoff,push}')::boolean;
  v_pickup_email := (p_preferences #>> '{pickup_dropoff,email}')::boolean;
  v_trip_push := (p_preferences #>> '{trip_updates,push}')::boolean;
  v_trip_email := (p_preferences #>> '{trip_updates,email}')::boolean;
  v_operations_push := (p_preferences #>> '{operational_alerts,push}')::boolean;
  v_operations_email := (p_preferences #>> '{operational_alerts,email}')::boolean;

  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
  values (v_profile.id, v_profile.tenant_id, v_push_master, v_email_master)
  on conflict (profile_id) do update
  set push_enabled = excluded.push_enabled,
      email_enabled = excluded.email_enabled,
      updated_at = now();

  insert into public.user_notification_category_preferences(
    profile_id, category, push_enabled, email_enabled, updated_at
  )
  values
    (v_profile.id, 'pickup_dropoff', v_pickup_push, v_pickup_email, now()),
    (v_profile.id, 'trip_status', v_trip_push, v_trip_email, now()),
    (v_profile.id, 'operations', v_operations_push, v_operations_email, now()),
    (v_profile.id, 'service_changes', v_operations_push, v_operations_email, now())
  on conflict (profile_id, category) do update
  set push_enabled = excluded.push_enabled,
      email_enabled = excluded.email_enabled,
      updated_at = excluded.updated_at;

  -- Keep the legacy pickup/drop-off path, but store the selection separately
  -- from the master email gate so disabling Email does not erase the choice.
  update public.guardians
  set pickup_dropoff_email_enabled = v_pickup_email,
      email_preferences_set_at = now(),
      updated_at = now()
  where id = v_guardian.id;

  update public.student_guardians
  set can_receive_notifications = (
        v_pickup_email or v_pickup_push or v_trip_push or v_operations_push
      ),
      notify_pickup = v_pickup_email,
      notify_dropoff = v_pickup_email,
      notification_preferences_set_at = now(),
      updated_at = now()
  where guardian_id = v_guardian.id;

  insert into public.guardian_student_push_preferences(
    student_guardian_id, category, push_enabled, preferences_set_at, updated_at
  )
  select sg.id, category.name, category.enabled, now(), now()
  from public.student_guardians sg
  cross join (values
    ('pickup_dropoff', v_pickup_push),
    ('trip_status', v_trip_push),
    ('operations', v_operations_push),
    ('service_changes', v_operations_push)
  ) category(name, enabled)
  where sg.guardian_id = v_guardian.id
  on conflict (student_guardian_id, category) do update
  set push_enabled = excluded.push_enabled,
      preferences_set_at = excluded.preferences_set_at,
      updated_at = excluded.updated_at;

  -- Cancel external work immediately when a master/category gate is off.
  update public.push_notification_outbox o
  set status = 'cancelled', cancelled_at = now(), lease_owner = null, lease_expires_at = null
  from public.user_notifications n
  where o.notification_id = n.id
    and n.recipient_profile_id = v_profile.id
    and o.status in ('pending', 'retry', 'processing')
    and (
      not v_push_master
      or (n.category = 'pickup_dropoff' and not v_pickup_push)
      or (n.category = 'trip_status' and not v_trip_push)
      or (n.category in ('operations', 'service_changes') and not v_operations_push)
    );

  update public.guardian_notification_outbox o
  set status = 'cancelled', cancelled_at = now(), claimed_at = null, claim_expires_at = null,
      failure_category = 'preference_disabled', failure_reason = 'guardian_email_preference_disabled'
  where o.guardian_id = v_guardian.id
    and o.status in ('pending', 'processing')
    and (
      not v_email_master
      or (o.notification_type in ('student_picked_up', 'student_dropped_off') and not v_pickup_email)
      or (o.notification_type in ('trip_started', 'trip_completed', 'trip_cancelled') and not v_trip_email)
      or (o.notification_type in (
        'trip_late', 'trip_missing', 'traffic_disruption', 'weather_disruption',
        'road_closure', 'mechanical_disruption', 'student_service_changed',
        'guardian_access_changed'
      ) and not v_operations_email)
    );

  return public.get_guardian_delivery_preferences_v2();
end;
$$;

revoke all on function public.get_guardian_delivery_preferences_v2() from public, anon, authenticated;
revoke all on function public.set_guardian_delivery_preferences_v2(jsonb) from public, anon, authenticated;
grant execute on function public.get_guardian_delivery_preferences_v2() to authenticated;
grant execute on function public.set_guardian_delivery_preferences_v2(jsonb) to authenticated;

comment on function public.get_guardian_delivery_preferences_v2() is
  'Returns the complete guardian account delivery snapshot without exposing student data.';
comment on function public.set_guardian_delivery_preferences_v2(jsonb) is
  'Atomically validates and saves guardian master and category delivery choices.';

-- New student links inherit category selections, not the current master state.
create or replace function public.sync_guardian_push_defaults_to_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  select g.profile_id into v_profile_id
  from public.guardians g
  where g.id = new.guardian_id
    and g.tenant_id = new.tenant_id
    and g.status = 'active';

  insert into public.guardian_student_push_preferences(
    student_guardian_id, category, push_enabled, preferences_set_at, updated_at
  )
  select
    new.id,
    category.name,
    coalesce((select cp.push_enabled
      from public.user_notification_category_preferences cp
      where cp.profile_id = v_profile_id and cp.category = category.name), false),
    now(),
    now()
  from (values ('pickup_dropoff'), ('trip_status'), ('operations'), ('service_changes')) category(name)
  on conflict (student_guardian_id, category) do update
  set push_enabled = excluded.push_enabled,
      preferences_set_at = excluded.preferences_set_at,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.sync_guardian_push_defaults_to_link() from public, anon, authenticated;

-- The historical link-level flag is also consulted by the push queue. Keep it
-- true when any external selection requires the link, while pickup/drop-off
-- email remains controlled by notify_pickup/notify_dropoff plus email gates.
create or replace function public.apply_guardian_delivery_defaults_to_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_email_enabled boolean := false;
  v_email_set_at timestamptz;
  v_any_push boolean := false;
begin
  if new.status = 'active' then
    select
      g.pickup_dropoff_email_enabled,
      g.email_preferences_set_at,
      coalesce((select bool_or(cp.push_enabled)
        from public.user_notification_category_preferences cp
        where cp.profile_id = g.profile_id
          and cp.category in ('pickup_dropoff', 'trip_status', 'operations', 'service_changes')), false)
    into v_email_enabled, v_email_set_at, v_any_push
    from public.guardians g
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
  end if;

  new.can_receive_notifications := (
    (coalesce(v_email_enabled, false) and v_email_set_at is not null)
    or coalesce(v_any_push, false)
  );
  new.notify_pickup := coalesce(v_email_enabled, false) and v_email_set_at is not null;
  new.notify_dropoff := new.notify_pickup;
  new.notification_preferences_set_at := case
    when new.can_receive_notifications then coalesce(v_email_set_at, now())
    else null
  end;
  return new;
end;
$$;

revoke all on function public.apply_guardian_delivery_defaults_to_link()
  from public, anon, authenticated;

-- Extend the existing durable outbox with canonical inbox references. Legacy
-- pickup/drop-off rows retain their student event path and dedupe key.
alter table public.guardian_notification_outbox
  drop constraint guardian_notification_outbox_type_check;
alter table public.guardian_notification_outbox
  alter column student_id drop not null,
  alter column student_trip_event_id drop not null,
  add column user_notification_id uuid references public.user_notifications(id) on delete cascade,
  add constraint guardian_notification_outbox_type_check check (notification_type in (
    'student_picked_up', 'student_dropped_off',
    'trip_started', 'trip_completed', 'trip_cancelled',
    'trip_late', 'trip_missing', 'traffic_disruption', 'weather_disruption',
    'road_closure', 'mechanical_disruption', 'student_service_changed',
    'guardian_access_changed'
  )),
  add constraint guardian_notification_outbox_source_check check (
    (notification_type in ('student_picked_up', 'student_dropped_off')
      and student_id is not null and student_trip_event_id is not null
      and user_notification_id is null)
    or
    (notification_type not in ('student_picked_up', 'student_dropped_off')
      and student_trip_event_id is null and user_notification_id is not null)
  );

create unique index guardian_notification_outbox_user_notification_unique
  on public.guardian_notification_outbox(tenant_id, guardian_id, user_notification_id, notification_type)
  where user_notification_id is not null;
create index guardian_notification_outbox_user_notification_idx
  on public.guardian_notification_outbox(user_notification_id)
  where user_notification_id is not null;

-- Link revocation/expiry cancels every pending delivery. Pickup consent
-- changes cancel only legacy pickup/drop-off work and do not erase or cancel
-- independent trip/operational email selections.
create or replace function public.cancel_ineligible_guardian_notification_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active'
    or (new.access_expires_at is not null and new.access_expires_at <= now()) then
    update public.guardian_notification_outbox
    set status = 'cancelled', cancelled_at = now(), claimed_at = null, claim_expires_at = null,
        failure_category = case when new.status <> 'active'
          then 'eligibility_revoked' else 'access_expired' end,
        failure_reason = 'guardian_notification_no_longer_authorized'
    where tenant_id = new.tenant_id
      and guardian_id = new.guardian_id
      and student_id = new.student_id
      and status in ('pending', 'processing');
  else
    update public.guardian_notification_outbox
    set status = 'cancelled', cancelled_at = now(), claimed_at = null, claim_expires_at = null,
        failure_category = 'preference_disabled',
        failure_reason = 'guardian_pickup_dropoff_email_preference_disabled'
    where tenant_id = new.tenant_id
      and guardian_id = new.guardian_id
      and student_id = new.student_id
      and user_notification_id is null
      and status in ('pending', 'processing')
      and (
        new.notification_preferences_set_at is null
        or new.can_receive_notifications = false
        or (notification_type = 'student_picked_up' and new.notify_pickup = false)
        or (notification_type = 'student_dropped_off' and new.notify_dropoff = false)
      );
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_ineligible_guardian_notification_work()
  from public, anon, authenticated;

create or replace function safebus_private.guardian_email_outbox_is_eligible(p_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guardian_notification_outbox o
    join public.guardians g
      on g.id = o.guardian_id and g.tenant_id = o.tenant_id and g.status = 'active'
    join public.profiles pr
      on pr.id = g.profile_id and pr.tenant_id = o.tenant_id
     and pr.role = 'guardian'::public.user_role and pr.status = 'active'
    join public.user_notification_settings settings
      on settings.profile_id = pr.id and settings.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = o.tenant_id
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    left join public.user_notifications n on n.id = o.user_notification_id
    where o.id = p_outbox_id
      and (
        (
          o.user_notification_id is null
          and g.pickup_dropoff_email_enabled
          and g.email_preferences_set_at is not null
          and exists (
            select 1 from public.user_notification_category_preferences cp
            where cp.profile_id = pr.id and cp.category = 'pickup_dropoff' and cp.email_enabled
          )
          and exists (
            select 1
            from public.student_guardians sg
            join public.student_trip_events event
              on event.id = o.student_trip_event_id
             and event.tenant_id = o.tenant_id
             and event.student_id = o.student_id
            where sg.tenant_id = o.tenant_id
              and sg.guardian_id = o.guardian_id
              and sg.student_id = o.student_id
              and sg.status = 'active'
              and (sg.access_expires_at is null or sg.access_expires_at > now())
              and sg.notification_preferences_set_at is not null
              and sg.can_receive_notifications
              and ((o.notification_type = 'student_picked_up' and sg.notify_pickup and event.event_type = 'picked_up')
                or (o.notification_type = 'student_dropped_off' and sg.notify_dropoff and event.event_type = 'dropped_off'))
          )
        )
        or
        (
          o.user_notification_id is not null
          and n.tenant_id = o.tenant_id
          and n.recipient_profile_id = pr.id
          and n.recipient_role = 'guardian'::public.user_role
          and n.event_type = o.notification_type
          and n.category in ('trip_status', 'operations', 'service_changes')
          and exists (
            select 1 from public.user_notification_category_preferences cp
            where cp.profile_id = pr.id and cp.category = n.category and cp.email_enabled
          )
          and (n.student_id is null or exists (
            select 1 from public.student_guardians sg
            where sg.tenant_id = o.tenant_id
              and sg.guardian_id = o.guardian_id
              and sg.student_id = n.student_id
              and sg.status = 'active'
              and (sg.access_expires_at is null or sg.access_expires_at > now())
          ))
        )
      )
  );
$$;

revoke all on function safebus_private.guardian_email_outbox_is_eligible(uuid)
  from public, anon, authenticated;

create or replace function safebus_private.enqueue_guardian_email_for_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guardian_id uuid;
begin
  if new.recipient_role <> 'guardian'::public.user_role
    or new.category not in ('trip_status', 'operations', 'service_changes')
    or new.event_type not in (
      'trip_started', 'trip_completed', 'trip_cancelled',
      'trip_late', 'trip_missing', 'traffic_disruption', 'weather_disruption',
      'road_closure', 'mechanical_disruption', 'student_service_changed',
      'guardian_access_changed'
    ) then
    return new;
  end if;

  select g.id into v_guardian_id
  from public.guardians g
  join public.profiles pr
    on pr.id = g.profile_id and pr.tenant_id = g.tenant_id
   and pr.role = 'guardian'::public.user_role and pr.status = 'active'
  join public.user_notification_settings settings
    on settings.profile_id = pr.id and settings.email_enabled
  join public.user_notification_category_preferences cp
    on cp.profile_id = pr.id and cp.category = new.category and cp.email_enabled
  join public.guardian_notification_delivery_policies policy
    on policy.tenant_id = g.tenant_id
   and policy.notifications_enabled
   and policy.privacy_review_status = 'approved'
   and policy.privacy_approved_at is not null
  where g.profile_id = new.recipient_profile_id
    and g.tenant_id = new.tenant_id
    and g.status = 'active'
    and (new.student_id is null or exists (
      select 1 from public.student_guardians sg
      where sg.tenant_id = g.tenant_id
        and sg.guardian_id = g.id
        and sg.student_id = new.student_id
        and sg.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    ));

  if v_guardian_id is not null then
    insert into public.guardian_notification_outbox(
      tenant_id, guardian_id, student_id, student_trip_event_id,
      user_notification_id, notification_type
    )
    values (
      new.tenant_id, v_guardian_id, new.student_id, null, new.id, new.event_type
    )
    on conflict (tenant_id, guardian_id, user_notification_id, notification_type)
      where user_notification_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists user_notifications_enqueue_guardian_email on public.user_notifications;
create trigger user_notifications_enqueue_guardian_email
  after insert on public.user_notifications
  for each row execute function safebus_private.enqueue_guardian_email_for_notification();

revoke all on function safebus_private.enqueue_guardian_email_for_notification()
  from public, anon, authenticated;

-- Both legacy and canonical inserts are rechecked before they enter the queue.
create or replace function public.enforce_guardian_notification_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  select g.profile_id into v_profile_id
  from public.guardians g
  join public.profiles pr on pr.id = g.profile_id and pr.status = 'active'
  join public.user_notification_settings settings
    on settings.profile_id = pr.id and settings.email_enabled
  join public.guardian_notification_delivery_policies policy
    on policy.tenant_id = g.tenant_id
   and policy.notifications_enabled
   and policy.privacy_review_status = 'approved'
   and policy.privacy_approved_at is not null
  where g.id = new.guardian_id
    and g.tenant_id = new.tenant_id
    and g.status = 'active';
  if v_profile_id is null then return null; end if;

  if new.user_notification_id is null then
    if not exists (
      select 1
      from public.guardians g
      join public.user_notification_category_preferences cp
        on cp.profile_id = g.profile_id and cp.category = 'pickup_dropoff' and cp.email_enabled
      join public.student_guardians sg
        on sg.guardian_id = g.id and sg.tenant_id = g.tenant_id
       and sg.student_id = new.student_id and sg.status = 'active'
       and (sg.access_expires_at is null or sg.access_expires_at > now())
       and sg.notification_preferences_set_at is not null
       and sg.can_receive_notifications
      where g.id = new.guardian_id
        and g.pickup_dropoff_email_enabled
        and g.email_preferences_set_at is not null
        and ((new.notification_type = 'student_picked_up' and sg.notify_pickup)
          or (new.notification_type = 'student_dropped_off' and sg.notify_dropoff))
    ) then return null; end if;
  else
    if not exists (
      select 1
      from public.user_notifications n
      join public.user_notification_category_preferences cp
        on cp.profile_id = n.recipient_profile_id and cp.category = n.category and cp.email_enabled
      where n.id = new.user_notification_id
        and n.tenant_id = new.tenant_id
        and n.recipient_profile_id = v_profile_id
        and n.recipient_role = 'guardian'::public.user_role
        and n.event_type = new.notification_type
        and n.category in ('trip_status', 'operations', 'service_changes')
        and (n.student_id is null or exists (
          select 1 from public.student_guardians sg
          where sg.tenant_id = new.tenant_id
            and sg.guardian_id = new.guardian_id
            and sg.student_id = n.student_id
            and sg.status = 'active'
            and (sg.access_expires_at is null or sg.access_expires_at > now())
        ))
    ) then return null; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_guardian_notification_enqueue()
  from public, anon, authenticated;

create or replace function public.claim_guardian_notification_email_batch(
  p_batch_size integer default 25,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5,
  p_provider_limit_per_minute integer default 50
)
returns table (
  id uuid,
  tenant_id uuid,
  guardian_id uuid,
  student_id uuid,
  student_trip_event_id uuid,
  notification_type text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification claiming requires service role.' using errcode = '42501';
  end if;

  update public.guardian_notification_outbox o
  set status = 'cancelled', cancelled_at = now(), claimed_at = null, claim_expires_at = null,
      failure_category = 'eligibility_revoked', failure_reason = 'guardian_email_no_longer_authorized'
  where o.status in ('pending', 'processing')
    and not safebus_private.guardian_email_outbox_is_eligible(o.id);

  return query
  with provider_capacity as (
    select greatest(0, least(coalesce(p_provider_limit_per_minute, 50), 1000)
      - count(*) filter (where last_attempted_at >= now() - interval '1 minute'))::integer remaining
    from public.guardian_notification_outbox
  ), tenant_capacity as (
    select policy.tenant_id,
      greatest(0, policy.tenant_daily_limit - count(o.id) filter (
        where o.status = 'delivered' and o.delivered_at >= now() - interval '24 hours'))::integer daily_remaining,
      greatest(0, policy.tenant_per_minute_limit - count(o.id) filter (
        where o.last_attempted_at >= now() - interval '1 minute'))::integer minute_remaining
    from public.guardian_notification_delivery_policies policy
    left join public.guardian_notification_outbox o on o.tenant_id = policy.tenant_id
    where policy.notifications_enabled
      and policy.privacy_review_status = 'approved'
      and policy.privacy_approved_at is not null
    group by policy.tenant_id, policy.tenant_daily_limit, policy.tenant_per_minute_limit
  ), locked as (
    select candidate.*
    from tenant_capacity capacity
    cross join lateral (
      select o.id, o.available_after, o.created_at
      from public.guardian_notification_outbox o
      where o.tenant_id = capacity.tenant_id
        and (o.status = 'pending' or (o.status = 'processing' and o.claim_expires_at < now()))
        and o.available_after <= now()
        and o.attempt_count < p_max_attempts
        and safebus_private.guardian_email_outbox_is_eligible(o.id)
      order by o.available_after, o.created_at, o.id
      limit least(capacity.daily_remaining, capacity.minute_remaining, 100)
      for update of o skip locked
    ) candidate
    where capacity.daily_remaining > 0 and capacity.minute_remaining > 0
  ), candidates as (
    select locked.id from locked cross join provider_capacity
    order by locked.available_after, locked.created_at, locked.id
    limit least(greatest(1, least(coalesce(p_batch_size, 25), 100)),
      (select remaining from provider_capacity))
  ), claimed as (
    update public.guardian_notification_outbox o
    set status = 'processing', attempt_count = o.attempt_count + 1,
        claimed_at = now(),
        claim_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
        last_attempted_at = now(), failure_reason = null, failure_category = null
    from candidates where o.id = candidates.id returning o.*
  )
  select claimed.id, claimed.tenant_id, claimed.guardian_id, claimed.student_id,
    claimed.student_trip_event_id, claimed.notification_type, claimed.attempt_count
  from claimed order by claimed.available_after, claimed.created_at, claimed.id;
end;
$$;

create or replace function public.resolve_guardian_notification_email_payload(p_outbox_id uuid)
returns table (
  outbox_id uuid,
  tenant_id uuid,
  guardian_id uuid,
  recipient_email text,
  student_first_name text,
  notification_type text,
  event_created_at timestamptz,
  tenant_timezone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification resolution requires service role.' using errcode = '42501';
  end if;

  return query
  select o.id, o.tenant_id, o.guardian_id,
    nullif(trim(coalesce(g.email, pr.email)), ''),
    case when o.user_notification_id is null
      then coalesce(nullif(trim(student.preferred_name), ''), student.first_name)
      else null
    end,
    o.notification_type,
    coalesce(notification.occurred_at, event.created_at),
    coalesce(nullif(trim(tenant.timezone), ''), 'America/Edmonton')
  from public.guardian_notification_outbox o
  join public.tenants tenant on tenant.id = o.tenant_id and tenant.status = 'active'
  join public.guardians g on g.id = o.guardian_id and g.tenant_id = o.tenant_id
  join public.profiles pr on pr.id = g.profile_id and pr.tenant_id = o.tenant_id
  left join public.user_notifications notification on notification.id = o.user_notification_id
  left join public.student_trip_events event on event.id = o.student_trip_event_id
  left join public.students student on student.id = o.student_id and student.tenant_id = o.tenant_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and safebus_private.guardian_email_outbox_is_eligible(o.id);
end;
$$;

create or replace function public.requeue_guardian_notification_dead_letter(p_outbox_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if not safebus_private.guardian_email_outbox_is_eligible(p_outbox_id) then
    return false;
  end if;
  update public.guardian_notification_outbox
  set status = 'pending', available_after = now(), attempt_count = 0,
      claimed_at = null, claim_expires_at = null, delivered_at = null,
      failed_at = null, cancelled_at = null, dead_lettered_at = null,
      failure_category = null, failure_reason = null
  where id = p_outbox_id and status = 'dead_lettered';
  return found;
end;
$$;

revoke all on function public.claim_guardian_notification_email_batch(integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.resolve_guardian_notification_email_payload(uuid)
  from public, anon, authenticated;
revoke all on function public.requeue_guardian_notification_dead_letter(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_guardian_notification_email_batch(integer, integer, integer, integer)
  to service_role;
grant execute on function public.resolve_guardian_notification_email_payload(uuid)
  to service_role;

comment on column public.guardian_notification_outbox.user_notification_id is
  'Canonical in-app notification reference for privacy-safe guardian trip and operational email. Null for legacy pickup/drop-off events.';
