-- SafeBus Alberta - Phase 15A guardian email notification delivery foundation

alter table public.guardian_notification_outbox
  drop constraint if exists guardian_notification_outbox_status_check;

alter table public.guardian_notification_outbox
  add constraint guardian_notification_outbox_status_check check (
    status in ('pending', 'processing', 'delivered', 'failed', 'cancelled')
  );

alter table public.guardian_notification_outbox
  drop constraint if exists guardian_notification_outbox_delivery_check;

alter table public.guardian_notification_outbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists failure_category text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.guardian_notification_outbox
  add constraint guardian_notification_outbox_delivery_check check (
    (status = 'delivered' and delivered_at is not null and failed_at is null and cancelled_at is null)
    or (status = 'failed' and failed_at is not null and delivered_at is null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and delivered_at is null)
    or (status in ('pending', 'processing') and delivered_at is null and failed_at is null and cancelled_at is null)
  );

alter table public.guardian_notification_outbox
  add constraint guardian_notification_outbox_attempt_count_check check (attempt_count >= 0 and attempt_count <= 10),
  add constraint guardian_notification_outbox_failure_category_check check (
    failure_category is null or failure_category in ('temporary_provider_error','permanent_provider_error','provider_timeout','missing_recipient_email','eligibility_revoked','configuration_error','unknown')
  );

create index if not exists guardian_notification_outbox_claim_idx
  on public.guardian_notification_outbox(status, available_after, claim_expires_at, created_at)
  where status in ('pending', 'processing');

create trigger set_updated_at_guardian_notification_outbox
  before update on public.guardian_notification_outbox
  for each row execute function public.set_updated_at();

create or replace function public.claim_guardian_notification_email_batch(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5
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
  with candidates as (
    select gno.id
    from public.guardian_notification_outbox gno
    where (
        gno.status = 'pending'
        or (gno.status = 'processing' and gno.claim_expires_at < now())
      )
      and gno.available_after <= now()
      and gno.attempt_count < p_max_attempts
    order by gno.available_after asc, gno.created_at asc
    limit greatest(1, least(coalesce(p_batch_size, 10), 50))
    for update skip locked
  ), claimed as (
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
    returning gno.id, gno.tenant_id, gno.guardian_id, gno.student_id, gno.student_trip_event_id, gno.notification_type, gno.attempt_count
  )
  select claimed.id, claimed.tenant_id, claimed.guardian_id, claimed.student_id, claimed.student_trip_event_id, claimed.notification_type, claimed.attempt_count from claimed;
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
  event_created_at timestamptz
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
  select o.id, o.tenant_id, o.guardian_id, nullif(trim(coalesce(g.email, p.email)), ''), coalesce(nullif(trim(s.preferred_name), ''), s.first_name), o.notification_type, e.created_at
  from public.guardian_notification_outbox o
  join public.tenants t on t.id = o.tenant_id and t.status = 'active'
  join public.guardians g on g.id = o.guardian_id and g.tenant_id = o.tenant_id and g.status = 'active'
  join public.profiles p on p.id = g.profile_id and p.tenant_id = o.tenant_id and p.role = 'guardian' and p.status = 'active'
  join public.students s on s.id = o.student_id and s.tenant_id = o.tenant_id and s.status = 'active'
  join public.student_guardians sg on sg.tenant_id = o.tenant_id and sg.student_id = o.student_id and sg.guardian_id = o.guardian_id and sg.status = 'active' and sg.can_receive_notifications = true
  join public.student_trip_events e on e.id = o.student_trip_event_id and e.tenant_id = o.tenant_id and e.student_id = o.student_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and ((o.notification_type = 'student_picked_up' and e.event_type = 'picked_up') or (o.notification_type = 'student_dropped_off' and e.event_type = 'dropped_off'));
end;
$$;

create or replace function public.complete_guardian_notification_email(
  p_outbox_id uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  update public.guardian_notification_outbox
  set status = 'delivered', delivered_at = now(), provider_message_id = left(nullif(p_provider_message_id, ''), 200), claim_expires_at = null, claimed_at = null, failure_reason = null, failure_category = null
  where id = p_outbox_id and status = 'processing' and delivered_at is null and failed_at is null;
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
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  select attempt_count into v_attempts from public.guardian_notification_outbox where id = p_outbox_id for update;
  if v_attempts >= p_max_attempts then
    update public.guardian_notification_outbox set status='failed', failed_at=now(), claim_expires_at=null, claimed_at=null, failure_category=coalesce(p_failure_category,'unknown'), failure_reason=left(coalesce(p_failure_reason,'delivery_failed'),120) where id=p_outbox_id and status='processing';
  else
    update public.guardian_notification_outbox set status='pending', available_after=now()+make_interval(secs => greatest(300, least(coalesce(p_retry_after_seconds, 900), 86400))), claim_expires_at=null, claimed_at=null, failure_category=coalesce(p_failure_category,'temporary_provider_error'), failure_reason=left(coalesce(p_failure_reason,'temporary_delivery_failure'),120) where id=p_outbox_id and status='processing';
  end if;
end;
$$;

create or replace function public.fail_guardian_notification_email(p_outbox_id uuid, p_failure_category text, p_failure_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  update public.guardian_notification_outbox set status='failed', failed_at=now(), claim_expires_at=null, claimed_at=null, failure_category=coalesce(p_failure_category,'unknown'), failure_reason=left(coalesce(p_failure_reason,'delivery_failed'),120) where id=p_outbox_id and status='processing';
end;
$$;

create or replace function public.cancel_guardian_notification_email(p_outbox_id uuid, p_failure_category text, p_failure_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  update public.guardian_notification_outbox set status='cancelled', cancelled_at=now(), claim_expires_at=null, claimed_at=null, failure_category=coalesce(p_failure_category,'eligibility_revoked'), failure_reason=left(coalesce(p_failure_reason,'delivery_cancelled'),120) where id=p_outbox_id and status='processing';
end;
$$;

revoke all on function public.claim_guardian_notification_email_batch(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.resolve_guardian_notification_email_payload(uuid) from public, anon, authenticated;
revoke all on function public.complete_guardian_notification_email(uuid, text) from public, anon, authenticated;
revoke all on function public.retry_guardian_notification_email(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_guardian_notification_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_guardian_notification_email(uuid, text, text) from public, anon, authenticated;

grant execute on function public.claim_guardian_notification_email_batch(integer, integer, integer) to service_role;
grant execute on function public.resolve_guardian_notification_email_payload(uuid) to service_role;
grant execute on function public.complete_guardian_notification_email(uuid, text) to service_role;
grant execute on function public.retry_guardian_notification_email(uuid, text, text, integer, integer) to service_role;
grant execute on function public.fail_guardian_notification_email(uuid, text, text) to service_role;
grant execute on function public.cancel_guardian_notification_email(uuid, text, text) to service_role;
