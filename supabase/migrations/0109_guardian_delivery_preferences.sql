-- BusSafe Alberta - simplified guardian delivery preferences
--
-- Guardians manage two account-level choices: Android push and combined
-- pickup/drop-off email. Existing per-category and per-student records remain
-- as internal delivery gates, but are synchronized from these two choices.

alter table public.guardians
  add column if not exists pickup_dropoff_email_enabled boolean not null default false,
  add column if not exists email_preferences_set_at timestamptz;

comment on column public.guardians.pickup_dropoff_email_enabled is
  'Guardian-owned account preference for both pickup and drop-off email across every linked student.';
comment on column public.guardians.email_preferences_set_at is
  'Timestamp of the guardian account-level email preference decision. Null remains fail-closed.';

-- Email consent is not an access change. Keep access notifications tied to
-- link creation, revocation, and expiry so preference toggles do not create a
-- burst of misleading guardian-access inbox events.
drop trigger if exists student_guardians_notify on public.student_guardians;
create trigger student_guardians_notify
  after insert or update of status, access_expires_at on public.student_guardians
  for each row execute function safebus_private.on_guardian_access_notification();

-- Preserve email only when every current active link already had explicit,
-- complete pickup and drop-off consent. Mixed or partial legacy choices become
-- off so consolidation cannot broaden consent.
update public.guardians g
set pickup_dropoff_email_enabled = true,
    email_preferences_set_at = consent.latest_preference
from (
  select
    sg.guardian_id,
    max(sg.notification_preferences_set_at) as latest_preference
  from public.student_guardians sg
  where sg.status = 'active'
    and (sg.access_expires_at is null or sg.access_expires_at > now())
  group by sg.guardian_id
  having bool_and(
    sg.can_receive_notifications
    and sg.notify_pickup
    and sg.notify_dropoff
    and sg.notification_preferences_set_at is not null
  )
) consent
where g.id = consent.guardian_id;

update public.student_guardians sg
set can_receive_notifications = g.pickup_dropoff_email_enabled,
    notify_pickup = g.pickup_dropoff_email_enabled,
    notify_dropoff = g.pickup_dropoff_email_enabled,
    notification_preferences_set_at = case
      when g.email_preferences_set_at is null then null
      else g.email_preferences_set_at
    end
from public.guardians g
where g.id = sg.guardian_id
  and sg.status = 'active';

create or replace function public.apply_guardian_delivery_defaults_to_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_email_enabled boolean := false;
  v_email_set_at timestamptz;
begin
  if new.status = 'active' then
    select
      g.pickup_dropoff_email_enabled,
      g.email_preferences_set_at
    into v_email_enabled, v_email_set_at
    from public.guardians g
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
  end if;

  new.can_receive_notifications := coalesce(v_email_enabled, false)
    and v_email_set_at is not null;
  new.notify_pickup := new.can_receive_notifications;
  new.notify_dropoff := new.can_receive_notifications;
  new.notification_preferences_set_at := case
    when new.can_receive_notifications then v_email_set_at
    else null
  end;
  return new;
end;
$$;

drop trigger if exists zz_student_guardians_apply_delivery_defaults on public.student_guardians;
create trigger zz_student_guardians_apply_delivery_defaults
  before insert or update of guardian_id, tenant_id, status, access_expires_at
  on public.student_guardians
  for each row execute function public.apply_guardian_delivery_defaults_to_link();

create or replace function public.sync_guardian_push_defaults_to_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_push_enabled boolean := false;
begin
  if new.status = 'active'
    and (new.access_expires_at is null or new.access_expires_at > now()) then
    select coalesce(s.push_enabled, false)
    into v_push_enabled
    from public.guardians g
    left join public.user_notification_settings s on s.profile_id = g.profile_id
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
  end if;

  insert into public.guardian_student_push_preferences(
    student_guardian_id,
    category,
    push_enabled,
    preferences_set_at,
    updated_at
  )
  values
    (new.id, 'pickup_dropoff', coalesce(v_push_enabled, false), now(), now()),
    (new.id, 'trip_status', coalesce(v_push_enabled, false), now(), now()),
    (new.id, 'service_changes', coalesce(v_push_enabled, false), now(), now())
  on conflict (student_guardian_id, category) do update
  set push_enabled = excluded.push_enabled,
      preferences_set_at = excluded.preferences_set_at,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists student_guardians_sync_push_defaults on public.student_guardians;
create trigger student_guardians_sync_push_defaults
  after insert or update of guardian_id, tenant_id, status, access_expires_at
  on public.student_guardians
  for each row execute function public.sync_guardian_push_defaults_to_link();

create or replace function public.get_guardian_delivery_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_push_enabled boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Guardian delivery preferences require an active guardian login.'
      using errcode = '42501';
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
    and g.status = 'active';
  if not found then
    raise exception 'Active guardian account not found.' using errcode = 'P0002';
  end if;

  insert into public.user_notification_settings(profile_id, tenant_id)
  values (v_profile.id, v_profile.tenant_id)
  on conflict (profile_id) do nothing;

  select s.push_enabled into v_push_enabled
  from public.user_notification_settings s
  where s.profile_id = v_profile.id;

  return jsonb_build_object(
    'push_enabled', coalesce(v_push_enabled, false),
    'email_pickup_dropoff_enabled',
      v_guardian.pickup_dropoff_email_enabled
      and v_guardian.email_preferences_set_at is not null
  );
end;
$$;

create or replace function public.set_guardian_delivery_preferences(
  p_push_enabled boolean,
  p_email_pickup_dropoff_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_push boolean := coalesce(p_push_enabled, false);
  v_email boolean := coalesce(p_email_pickup_dropoff_enabled, false);
begin
  if auth.uid() is null then
    raise exception 'Guardian delivery preferences require an active guardian login.'
      using errcode = '42501';
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

  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled)
  values (v_profile.id, v_profile.tenant_id, v_push)
  on conflict (profile_id) do update
  set push_enabled = excluded.push_enabled,
      updated_at = now();

  insert into public.user_notification_category_preferences(profile_id, category, push_enabled)
  values
    (v_profile.id, 'pickup_dropoff', v_push),
    (v_profile.id, 'trip_status', v_push),
    (v_profile.id, 'service_changes', v_push),
    (v_profile.id, 'assignments', v_push),
    (v_profile.id, 'operations', v_push)
  on conflict (profile_id, category) do update
  set push_enabled = excluded.push_enabled,
      updated_at = now();

  update public.guardians
  set pickup_dropoff_email_enabled = v_email,
      email_preferences_set_at = now(),
      updated_at = now()
  where id = v_guardian.id;

  update public.student_guardians
  set can_receive_notifications = v_email,
      notify_pickup = v_email,
      notify_dropoff = v_email,
      notification_preferences_set_at = now(),
      updated_at = now()
  where guardian_id = v_guardian.id;

  insert into public.guardian_student_push_preferences(
    student_guardian_id,
    category,
    push_enabled,
    preferences_set_at,
    updated_at
  )
  select sg.id, category.name, v_push, now(), now()
  from public.student_guardians sg
  cross join (
    values ('pickup_dropoff'), ('trip_status'), ('service_changes')
  ) as category(name)
  where sg.guardian_id = v_guardian.id
  on conflict (student_guardian_id, category) do update
  set push_enabled = excluded.push_enabled,
      preferences_set_at = excluded.preferences_set_at,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'push_enabled', v_push,
    'email_pickup_dropoff_enabled', v_email
  );
end;
$$;

revoke all on function public.apply_guardian_delivery_defaults_to_link() from public, anon, authenticated;
revoke all on function public.sync_guardian_push_defaults_to_link() from public, anon, authenticated;
revoke all on function public.get_guardian_delivery_preferences() from public, anon, authenticated;
revoke all on function public.set_guardian_delivery_preferences(boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.get_guardian_delivery_preferences() to authenticated;
grant execute on function public.set_guardian_delivery_preferences(boolean, boolean) to authenticated;

comment on function public.get_guardian_delivery_preferences() is
  'Returns the authenticated guardian account-level push and combined pickup/drop-off email choices.';
comment on function public.set_guardian_delivery_preferences(boolean, boolean) is
  'Atomically applies simplified guardian delivery choices to all current student links and internal category gates.';
