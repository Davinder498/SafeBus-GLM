-- SafeBus Alberta - Phase 8 guardian experience and notification hardening
--
-- Adds expiry-aware guardian authorization, explicit per-student guardian
-- notification preferences, privacy-review gating, tenant/provider dispatch
-- limits, and a distinct dead-letter terminal state. Existing bus-first
-- contracts remain the source of guardian data; the browser receives no
-- route, stop, driver, manifest, or unrelated-student identifiers.

alter table public.student_guardians
  add column if not exists access_expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists notify_pickup boolean not null default false,
  add column if not exists notify_dropoff boolean not null default false,
  add column if not exists notification_preferences_set_at timestamptz;

alter table public.student_guardians
  add constraint student_guardians_notification_preference_check check (
    can_receive_notifications
    or (notify_pickup = false and notify_dropoff = false)
  );

create index if not exists student_guardians_guardian_effective_idx
  on public.student_guardians(tenant_id, guardian_id, student_id, access_expires_at)
  where status = 'active';

comment on column public.student_guardians.access_expires_at is
  'Optional exclusive access expiry. Guardian authorization checks fail as soon as this timestamp is reached.';
comment on column public.student_guardians.notification_preferences_set_at is
  'Set only after the guardian explicitly saves email pickup/drop-off choices. Null means fail-closed: no notification delivery.';

-- Keep revocation metadata consistent for every existing admin mutation path.
create or replace function public.set_student_guardian_revocation_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active' then
    new.revoked_at := coalesce(new.revoked_at, now());
    new.can_receive_notifications := false;
    new.notify_pickup := false;
    new.notify_dropoff := false;
  elsif old.status is distinct from 'active' then
    new.revoked_at := null;
    new.notification_preferences_set_at := null;
    new.can_receive_notifications := false;
    new.notify_pickup := false;
    new.notify_dropoff := false;
  end if;
  return new;
end;
$$;

drop trigger if exists student_guardians_revocation_metadata on public.student_guardians;
create trigger student_guardians_revocation_metadata
  before update of status on public.student_guardians
  for each row execute function public.set_student_guardian_revocation_metadata();

-- Existing true eligibility flags were administrative flags, not guardian
-- consent. Leave them visible to admins but require a new explicit consent
-- timestamp before any enqueue or delivery.
update public.student_guardians
set notify_pickup = false,
    notify_dropoff = false,
    notification_preferences_set_at = null
where notification_preferences_set_at is null;

create table public.guardian_notification_delivery_policies (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  notifications_enabled boolean not null default false,
  privacy_review_status text not null default 'pending',
  tenant_daily_limit integer not null default 500,
  tenant_per_minute_limit integer not null default 20,
  privacy_approved_at timestamptz,
  privacy_approved_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint guardian_notification_policy_review_check check (
    privacy_review_status in ('pending', 'approved', 'rejected')
  ),
  constraint guardian_notification_policy_limits_check check (
    tenant_daily_limit between 1 and 100000
    and tenant_per_minute_limit between 1 and 1000
  ),
  constraint guardian_notification_policy_approval_check check (
    (privacy_review_status = 'approved' and privacy_approved_at is not null)
    or (privacy_review_status <> 'approved' and notifications_enabled = false)
  )
);

insert into public.guardian_notification_delivery_policies(tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.create_default_guardian_notification_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.guardian_notification_delivery_policies(tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_create_guardian_notification_policy on public.tenants;
create trigger tenants_create_guardian_notification_policy
  after insert on public.tenants
  for each row execute function public.create_default_guardian_notification_policy();

revoke all on function public.create_default_guardian_notification_policy() from public, anon, authenticated;

alter table public.guardian_notification_delivery_policies enable row level security;
revoke all on public.guardian_notification_delivery_policies from public, anon, authenticated;

create trigger set_updated_at_guardian_notification_delivery_policies
  before update on public.guardian_notification_delivery_policies
  for each row execute function public.set_updated_at();

comment on table public.guardian_notification_delivery_policies is
  'Fail-closed tenant notification gate. Delivery remains disabled until a recorded privacy approval sets approved status and explicitly enables notifications.';

-- Guardian-owned, expiry-aware preference read contract. It returns only the
-- caller's effective links and a student display name.
create or replace function public.get_guardian_notification_preferences()
returns table (
  student_id uuid,
  student_name text,
  email_enabled boolean,
  notify_pickup boolean,
  notify_dropoff boolean,
  preferences_set_at timestamptz,
  access_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid := public.current_guardian_id();
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'guardian'::public.user_role
    or v_guardian_id is null
    or v_tenant_id is null then
    raise exception 'Guardian notification preferences require an active guardian login.'
      using errcode = '42501';
  end if;

  return query
  select
    s.id,
    concat_ws(' ', s.first_name, s.last_name),
    sg.can_receive_notifications and sg.notification_preferences_set_at is not null,
    sg.notify_pickup,
    sg.notify_dropoff,
    sg.notification_preferences_set_at,
    sg.access_expires_at
  from public.student_guardians sg
  join public.students s
    on s.id = sg.student_id
   and s.tenant_id = sg.tenant_id
   and s.status = 'active'
  where sg.tenant_id = v_tenant_id
    and sg.guardian_id = v_guardian_id
    and sg.status = 'active'
    and (sg.access_expires_at is null or sg.access_expires_at > now())
  order by s.first_name, s.last_name, s.id;
end;
$$;

create or replace function public.set_guardian_notification_preferences(
  p_student_id uuid,
  p_email_enabled boolean,
  p_notify_pickup boolean,
  p_notify_dropoff boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid := public.current_guardian_id();
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'guardian'::public.user_role
    or v_guardian_id is null
    or v_tenant_id is null then
    raise exception 'Guardian notification preferences require an active guardian login.'
      using errcode = '42501';
  end if;
  if p_student_id is null then
    raise exception 'Student is required.' using errcode = '22004';
  end if;

  update public.student_guardians
  set can_receive_notifications = coalesce(p_email_enabled, false),
      notify_pickup = coalesce(p_email_enabled, false) and coalesce(p_notify_pickup, false),
      notify_dropoff = coalesce(p_email_enabled, false) and coalesce(p_notify_dropoff, false),
      notification_preferences_set_at = now()
  where tenant_id = v_tenant_id
    and guardian_id = v_guardian_id
    and student_id = p_student_id
    and status = 'active'
    and (access_expires_at is null or access_expires_at > now());

  if not found then
    raise exception 'Authorized student link not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_guardian_notification_preferences() from public, anon;
revoke all on function public.set_guardian_notification_preferences(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_guardian_notification_preferences() to authenticated;
grant execute on function public.set_guardian_notification_preferences(uuid, boolean, boolean, boolean) to authenticated;

drop function if exists public.get_admin_guardian_links(uuid);
create or replace function public.get_admin_guardian_links(p_guardian_id uuid)
returns table(
  id uuid,
  student_id uuid,
  student_name text,
  relationship text,
  status text,
  access_expires_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select sg.id, sg.student_id, concat_ws(' ', s.first_name, s.last_name),
    sg.relationship, sg.status::text, sg.access_expires_at
  from public.student_guardians sg
  join public.students s on s.id = sg.student_id and s.tenant_id = sg.tenant_id
  where public.is_transportation_write_admin()
    and sg.tenant_id = public.current_tenant_id()
    and sg.guardian_id = p_guardian_id
  order by s.last_name, s.first_name, sg.id;
$$;

create or replace function public.admin_set_guardian_access_expiry(
  p_student_guardian_id uuid,
  p_access_expires_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.student_guardians;
  v_student public.students;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_access_expires_at is not null and p_access_expires_at <= now() then
    raise exception 'Access expiry must be in the future.' using errcode = '22023';
  end if;

  select * into v_link
  from public.student_guardians
  where id = p_student_guardian_id and tenant_id = v_tenant_id
  for update;
  if not found then
    raise exception 'Guardian link not found.' using errcode = 'P0002';
  end if;

  select * into v_student from public.students
  where id = v_link.student_id and tenant_id = v_tenant_id;
  if not found or not public.can_write_school(v_student.tenant_id, v_student.school_id) then
    raise exception 'Guardian link not found.' using errcode = 'P0002';
  end if;

  update public.student_guardians
  set access_expires_at = p_access_expires_at
  where id = v_link.id;

  begin
    perform public.write_audit_event(
      'guardian.access_expiry_changed', v_tenant_id, v_link.id::text,
      'student_guardian', 'success',
      jsonb_build_object(
        'has_expiry', p_access_expires_at is not null,
        'actor', auth.uid()::text
      )
    );
  exception when others then null;
  end;

  return p_access_expires_at;
end;
$$;

revoke all on function public.get_admin_guardian_links(uuid) from public, anon;
revoke all on function public.admin_set_guardian_access_expiry(uuid, timestamptz) from public, anon;
grant execute on function public.get_admin_guardian_links(uuid) to authenticated;
grant execute on function public.admin_set_guardian_access_expiry(uuid, timestamptz) to authenticated;

-- Expiry-aware wrapper around the established server-scoped bus response.
-- Retire direct browser execution of the older contract so expiry cannot be
-- bypassed by calling it manually.
create or replace function public.get_guardian_bus_visibility_v2()
returns table (
  student_id uuid,
  student_name text,
  student_grade text,
  assignment_state text,
  bus_number text,
  license_plate text,
  has_active_trip boolean,
  location_state text,
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  location_age_seconds bigint,
  eta_status text,
  eta_label text,
  student_trip_status text,
  pickup_event_time timestamptz,
  dropoff_event_time timestamptz,
  last_event_time timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select visibility.*
  from public.get_guardian_bus_visibility() visibility
  join public.student_guardians sg
    on sg.student_id = visibility.student_id
   and sg.tenant_id = public.current_tenant_id()
   and sg.guardian_id = public.current_guardian_id()
   and sg.status = 'active'
   and (sg.access_expires_at is null or sg.access_expires_at > now())
  where auth.uid() is not null
    and public.current_user_role() is not distinct from 'guardian'::public.user_role;
$$;

revoke execute on function public.get_guardian_bus_visibility() from authenticated;
revoke all on function public.get_guardian_bus_visibility_v2() from public, anon;
grant execute on function public.get_guardian_bus_visibility_v2() to authenticated;

drop policy if exists "students select linked guardian" on public.students;
create policy "students select linked guardian"
  on public.students for select to authenticated
  using (
    public.current_user_role() = 'guardian'
    and exists (
      select 1 from public.student_guardians sg
      where sg.student_id = students.id
        and sg.guardian_id = public.current_guardian_id()
        and sg.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    )
  );

drop policy if exists "student guardians select own guardian links" on public.student_guardians;
create policy "student guardians select own guardian links"
  on public.student_guardians for select to authenticated
  using (
    public.current_user_role() = 'guardian'
    and guardian_id = public.current_guardian_id()
    and status = 'active'
    and (access_expires_at is null or access_expires_at > now())
  );

-- Explicit dead-letter lifecycle.
alter table public.guardian_notification_outbox
  drop constraint if exists guardian_notification_outbox_status_check,
  drop constraint if exists guardian_notification_outbox_delivery_check,
  drop constraint if exists guardian_notification_outbox_failure_category_check;

alter table public.guardian_notification_outbox
  add column if not exists dead_lettered_at timestamptz,
  add constraint guardian_notification_outbox_status_check check (
    status in ('pending', 'processing', 'delivered', 'failed', 'dead_lettered', 'cancelled')
  ),
  add constraint guardian_notification_outbox_failure_category_check check (
    failure_category is null or failure_category in (
      'temporary_provider_error', 'permanent_provider_error', 'provider_timeout',
      'missing_recipient_email', 'eligibility_revoked', 'access_expired',
      'preference_disabled', 'privacy_consent_required', 'configuration_error', 'unknown'
    )
  ),
  add constraint guardian_notification_outbox_delivery_check check (
    (status = 'delivered' and delivered_at is not null and failed_at is null and cancelled_at is null and dead_lettered_at is null)
    or (status = 'failed' and failed_at is not null and delivered_at is null and cancelled_at is null and dead_lettered_at is null)
    or (status = 'dead_lettered' and dead_lettered_at is not null and delivered_at is null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and delivered_at is null and dead_lettered_at is null)
    or (status in ('pending', 'processing') and delivered_at is null and failed_at is null and cancelled_at is null and dead_lettered_at is null)
  );

-- Cancel queued work as soon as access or preferences are changed. Expiry is
-- also rechecked by claim and payload resolution using now().
create or replace function public.cancel_ineligible_guardian_notification_work()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active'
    or (new.access_expires_at is not null and new.access_expires_at <= now())
    or new.notification_preferences_set_at is null
    or new.can_receive_notifications = false then
    update public.guardian_notification_outbox
    set status = 'cancelled',
        cancelled_at = now(),
        claimed_at = null,
        claim_expires_at = null,
        failure_category = case
          when new.status <> 'active' then 'eligibility_revoked'
          when new.access_expires_at is not null and new.access_expires_at <= now() then 'access_expired'
          when new.notification_preferences_set_at is null then 'privacy_consent_required'
          else 'preference_disabled'
        end,
        failure_reason = 'guardian_notification_no_longer_authorized'
    where tenant_id = new.tenant_id
      and guardian_id = new.guardian_id
      and student_id = new.student_id
      and status in ('pending', 'processing');
  else
    update public.guardian_notification_outbox
    set status = 'cancelled',
        cancelled_at = now(),
        claimed_at = null,
        claim_expires_at = null,
        failure_category = 'preference_disabled',
        failure_reason = 'guardian_event_preference_disabled'
    where tenant_id = new.tenant_id
      and guardian_id = new.guardian_id
      and student_id = new.student_id
      and status in ('pending', 'processing')
      and ((notification_type = 'student_picked_up' and new.notify_pickup = false)
        or (notification_type = 'student_dropped_off' and new.notify_dropoff = false));
  end if;
  return new;
end;
$$;

drop trigger if exists guardian_notification_cancel_on_link_change on public.student_guardians;
create trigger guardian_notification_cancel_on_link_change
  after update of status, access_expires_at, can_receive_notifications,
    notify_pickup, notify_dropoff, notification_preferences_set_at
  on public.student_guardians
  for each row execute function public.cancel_ineligible_guardian_notification_work();

revoke all on function public.cancel_ineligible_guardian_notification_work() from public, anon, authenticated;

-- Suppress enqueue unless both guardian consent and the tenant privacy gate
-- authorize this exact event type.
create or replace function public.enforce_guardian_notification_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.student_guardians sg
    join public.guardian_notification_delivery_policies p
      on p.tenant_id = sg.tenant_id
     and p.notifications_enabled = true
     and p.privacy_review_status = 'approved'
     and p.privacy_approved_at is not null
    where sg.tenant_id = new.tenant_id
      and sg.guardian_id = new.guardian_id
      and sg.student_id = new.student_id
      and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
      and sg.notification_preferences_set_at is not null
      and sg.can_receive_notifications = true
      and ((new.notification_type = 'student_picked_up' and sg.notify_pickup)
        or (new.notification_type = 'student_dropped_off' and sg.notify_dropoff))
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists guardian_notification_enqueue_authorization on public.guardian_notification_outbox;
create trigger guardian_notification_enqueue_authorization
  before insert on public.guardian_notification_outbox
  for each row execute function public.enforce_guardian_notification_enqueue();

revoke all on function public.enforce_guardian_notification_enqueue() from public, anon, authenticated;

-- Existing unconsented pending work must not survive the fail-closed upgrade.
update public.guardian_notification_outbox o
set status = 'cancelled',
    cancelled_at = now(),
    claimed_at = null,
    claim_expires_at = null,
    failure_category = 'privacy_consent_required',
    failure_reason = 'explicit_guardian_preference_required'
where o.status in ('pending', 'processing')
  and not exists (
    select 1 from public.student_guardians sg
    where sg.tenant_id = o.tenant_id
      and sg.guardian_id = o.guardian_id
      and sg.student_id = o.student_id
      and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
      and sg.notification_preferences_set_at is not null
      and sg.can_receive_notifications = true
      and ((o.notification_type = 'student_picked_up' and sg.notify_pickup)
        or (o.notification_type = 'student_dropped_off' and sg.notify_dropoff))
  );

drop function if exists public.claim_guardian_notification_email_batch(integer, integer, integer);
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
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification claiming requires service role.' using errcode = '42501';
  end if;

  return query
  with provider_capacity as (
    select greatest(
      0,
      least(coalesce(p_provider_limit_per_minute, 50), 1000)
        - count(*) filter (where last_attempted_at >= now() - interval '1 minute')
    )::integer as remaining
    from public.guardian_notification_outbox
  ),
  tenant_capacity as (
    select
      p.tenant_id,
      greatest(0, p.tenant_daily_limit - count(o.id) filter (
        where o.status = 'delivered' and o.delivered_at >= now() - interval '24 hours'
      ))::integer as daily_remaining,
      greatest(0, p.tenant_per_minute_limit - count(o.id) filter (
        where o.last_attempted_at >= now() - interval '1 minute'
      ))::integer as minute_remaining
    from public.guardian_notification_delivery_policies p
    left join public.guardian_notification_outbox o on o.tenant_id = p.tenant_id
    where p.notifications_enabled = true
      and p.privacy_review_status = 'approved'
      and p.privacy_approved_at is not null
    group by p.tenant_id, p.tenant_daily_limit, p.tenant_per_minute_limit
  ),
  locked as (
    select candidate.*
    from tenant_capacity tc
    cross join lateral (
      select gno.id, gno.tenant_id, gno.available_after, gno.created_at
      from public.guardian_notification_outbox gno
      join public.student_guardians sg
        on sg.tenant_id = gno.tenant_id
       and sg.guardian_id = gno.guardian_id
       and sg.student_id = gno.student_id
       and sg.status = 'active'
       and (sg.access_expires_at is null or sg.access_expires_at > now())
       and sg.notification_preferences_set_at is not null
       and sg.can_receive_notifications = true
       and ((gno.notification_type = 'student_picked_up' and sg.notify_pickup)
         or (gno.notification_type = 'student_dropped_off' and sg.notify_dropoff))
      where gno.tenant_id = tc.tenant_id
        and (gno.status = 'pending'
          or (gno.status = 'processing' and gno.claim_expires_at < now()))
        and gno.available_after <= now()
        and gno.attempt_count < p_max_attempts
      order by gno.available_after, gno.created_at, gno.id
      limit least(tc.daily_remaining, tc.minute_remaining, 100)
      for update of gno skip locked
    ) candidate
    where tc.daily_remaining > 0 and tc.minute_remaining > 0
  ),
  candidates as (
    select locked.id
    from locked cross join provider_capacity pc
    order by locked.available_after, locked.created_at, locked.id
    limit least(
      greatest(1, least(coalesce(p_batch_size, 25), 100)),
      (select remaining from provider_capacity)
    )
  ),
  claimed as (
    update public.guardian_notification_outbox gno
    set status = 'processing',
        attempt_count = gno.attempt_count + 1,
        claimed_at = now(),
        claim_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
        last_attempted_at = now(),
        failure_reason = null,
        failure_category = null
    from candidates
    where gno.id = candidates.id
    returning gno.*
  )
  select claimed.id, claimed.tenant_id, claimed.guardian_id, claimed.student_id,
    claimed.student_trip_event_id, claimed.notification_type, claimed.attempt_count
  from claimed
  order by claimed.available_after, claimed.created_at, claimed.id;
end;
$$;

drop function if exists public.resolve_guardian_notification_email_payload(uuid);
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
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification resolution requires service role.' using errcode = '42501';
  end if;

  return query
  select o.id, o.tenant_id, o.guardian_id,
    nullif(trim(coalesce(g.email, pr.email)), ''),
    coalesce(nullif(trim(s.preferred_name), ''), s.first_name),
    o.notification_type, e.created_at,
    coalesce(nullif(trim(t.timezone), ''), 'America/Edmonton')
  from public.guardian_notification_outbox o
  join public.tenants t on t.id = o.tenant_id and t.status = 'active'
  join public.guardian_notification_delivery_policies pol
    on pol.tenant_id = o.tenant_id
   and pol.notifications_enabled = true
   and pol.privacy_review_status = 'approved'
   and pol.privacy_approved_at is not null
  join public.guardians g
    on g.id = o.guardian_id and g.tenant_id = o.tenant_id and g.status = 'active'
  join public.profiles pr
    on pr.id = g.profile_id and pr.tenant_id = o.tenant_id
   and pr.role = 'guardian' and pr.status = 'active'
  join public.students s
    on s.id = o.student_id and s.tenant_id = o.tenant_id and s.status = 'active'
  join public.student_guardians sg
    on sg.tenant_id = o.tenant_id and sg.student_id = o.student_id
   and sg.guardian_id = o.guardian_id and sg.status = 'active'
   and (sg.access_expires_at is null or sg.access_expires_at > now())
   and sg.notification_preferences_set_at is not null
   and sg.can_receive_notifications = true
   and ((o.notification_type = 'student_picked_up' and sg.notify_pickup)
     or (o.notification_type = 'student_dropped_off' and sg.notify_dropoff))
  join public.student_trip_events e
    on e.id = o.student_trip_event_id and e.tenant_id = o.tenant_id and e.student_id = o.student_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and ((o.notification_type = 'student_picked_up' and e.event_type = 'picked_up')
      or (o.notification_type = 'student_dropped_off' and e.event_type = 'dropped_off'));
end;
$$;

create or replace function public.retry_guardian_notification_email(
  p_outbox_id uuid,
  p_failure_category text,
  p_failure_reason text,
  p_retry_after_seconds integer,
  p_max_attempts integer default 5
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_attempts integer;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select attempt_count into v_attempts
  from public.guardian_notification_outbox where id = p_outbox_id for update;
  if v_attempts >= p_max_attempts then
    update public.guardian_notification_outbox
    set status = 'dead_lettered', dead_lettered_at = now(), claim_expires_at = null,
        claimed_at = null, failure_category = coalesce(p_failure_category, 'unknown'),
        failure_reason = left(coalesce(p_failure_reason, 'delivery_failed'), 120)
    where id = p_outbox_id and status = 'processing';
  else
    update public.guardian_notification_outbox
    set status = 'pending',
        available_after = now() + make_interval(secs => greatest(60, least(coalesce(p_retry_after_seconds, 900), 86400))),
        claim_expires_at = null, claimed_at = null,
        failure_category = coalesce(p_failure_category, 'temporary_provider_error'),
        failure_reason = left(coalesce(p_failure_reason, 'temporary_delivery_failure'), 120)
    where id = p_outbox_id and status = 'processing';
  end if;
end;
$$;

create or replace function public.fail_guardian_notification_email(
  p_outbox_id uuid,
  p_failure_category text,
  p_failure_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  update public.guardian_notification_outbox
  set status = 'dead_lettered', dead_lettered_at = now(), claim_expires_at = null,
      claimed_at = null, failure_category = coalesce(p_failure_category, 'unknown'),
      failure_reason = left(coalesce(p_failure_reason, 'delivery_failed'), 120)
  where id = p_outbox_id and status = 'processing';
end;
$$;

create or replace function public.requeue_guardian_notification_dead_letter(p_outbox_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.guardian_notification_outbox;
  v_eligible boolean;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select * into v_row
  from public.guardian_notification_outbox
  where id = p_outbox_id and status = 'dead_lettered'
  for update;
  if not found then return false; end if;

  select exists (
    select 1
    from public.student_guardians sg
    join public.guardian_notification_delivery_policies p
      on p.tenant_id = sg.tenant_id
     and p.notifications_enabled = true
     and p.privacy_review_status = 'approved'
     and p.privacy_approved_at is not null
    where sg.tenant_id = v_row.tenant_id
      and sg.guardian_id = v_row.guardian_id
      and sg.student_id = v_row.student_id
      and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
      and sg.notification_preferences_set_at is not null
      and sg.can_receive_notifications = true
      and ((v_row.notification_type = 'student_picked_up' and sg.notify_pickup)
        or (v_row.notification_type = 'student_dropped_off' and sg.notify_dropoff))
  ) into v_eligible;

  if v_eligible then
    update public.guardian_notification_outbox
    set status = 'pending', available_after = now(), attempt_count = 0,
        dead_lettered_at = null, failed_at = null, failure_category = null,
        failure_reason = null, claimed_at = null, claim_expires_at = null
    where id = p_outbox_id;
  else
    update public.guardian_notification_outbox
    set status = 'cancelled', cancelled_at = now(), dead_lettered_at = null,
        failure_category = 'eligibility_revoked',
        failure_reason = 'dead_letter_no_longer_authorized'
    where id = p_outbox_id;
  end if;
  return v_eligible;
end;
$$;

revoke all on function public.claim_guardian_notification_email_batch(integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.resolve_guardian_notification_email_payload(uuid) from public, anon, authenticated;
revoke all on function public.retry_guardian_notification_email(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_guardian_notification_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.requeue_guardian_notification_dead_letter(uuid) from public, anon, authenticated;
grant execute on function public.claim_guardian_notification_email_batch(integer, integer, integer, integer) to service_role;
grant execute on function public.resolve_guardian_notification_email_payload(uuid) to service_role;
grant execute on function public.retry_guardian_notification_email(uuid, text, text, integer, integer) to service_role;
grant execute on function public.fail_guardian_notification_email(uuid, text, text) to service_role;
grant execute on function public.requeue_guardian_notification_dead_letter(uuid) to service_role;

create or replace function public.get_tenant_notification_delivery_summary(
  p_recent_window_hours integer default 24
)
returns table (
  pending_count bigint,
  processing_count bigint,
  delivered_count_recent bigint,
  failed_count_recent bigint,
  cancelled_count_recent bigint,
  oldest_pending_age_seconds integer,
  recent_failure_categories jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role text := public.current_user_role();
  v_window_start timestamptz;
begin
  if auth.uid() is null
    or v_role is null
    or v_role not in ('tenant_admin', 'school_admin', 'transportation_admin')
    or v_tenant_id is null then
    raise exception 'Notification delivery summary requires a tenant operational admin role.'
      using errcode = '42501';
  end if;
  v_window_start := now() - make_interval(
    hours => greatest(1, least(coalesce(p_recent_window_hours, 24), 168))
  );

  return query
  with agg as (
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'processing') as processing,
      count(*) filter (where status = 'delivered' and delivered_at >= v_window_start) as delivered,
      count(*) filter (
        where status in ('failed', 'dead_lettered')
          and coalesce(failed_at, dead_lettered_at) >= v_window_start
      ) as failed,
      count(*) filter (where status = 'cancelled' and cancelled_at >= v_window_start) as cancelled,
      coalesce(extract(epoch from (now() - min(created_at) filter (where status = 'pending')))::integer, 0) as oldest
    from public.guardian_notification_outbox
    where tenant_id = v_tenant_id
  ), categories as (
    select coalesce(
      jsonb_agg(jsonb_build_object('category', category, 'count', count_value)),
      '[]'::jsonb
    ) as values
    from (
      select failure_category as category, count(*) as count_value
      from public.guardian_notification_outbox
      where tenant_id = v_tenant_id
        and failure_category is not null
        and status in ('failed', 'dead_lettered', 'cancelled')
        and coalesce(failed_at, dead_lettered_at, cancelled_at) >= v_window_start
      group by failure_category
      order by count(*) desc
      limit 10
    ) recent
  )
  select agg.pending, agg.processing, agg.delivered, agg.failed, agg.cancelled,
    agg.oldest, categories.values
  from agg cross join categories;
end;
$$;

comment on function public.claim_guardian_notification_email_batch(integer, integer, integer, integer) is
  'Durably claims ordered notification work with leases, skip-locked concurrency, explicit guardian consent, access expiry, tenant quotas, and a provider-wide per-minute cap.';
comment on function public.get_guardian_bus_visibility_v2() is
  'Expiry-aware guardian bus-only response. No manifests, other stops, route geometry, driver identity, or operational UUIDs are returned.';
