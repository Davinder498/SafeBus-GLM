-- SafeBus Alberta - guardian notification outbox foundation
--
-- Milestone 9A: durable tenant-scoped outbox rows for future guardian
-- pickup/drop-off notifications. This migration deliberately does not send
-- SMS, email, push, webhooks, realtime messages, or provider calls.

create table public.guardian_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_trip_event_id uuid not null references public.student_trip_events(id) on delete cascade,
  notification_type text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  available_after timestamptz not null default now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  constraint guardian_notification_outbox_type_check check (
    notification_type in ('student_picked_up', 'student_dropped_off')
  ),
  constraint guardian_notification_outbox_status_check check (
    status in ('pending', 'delivered', 'failed', 'cancelled')
  ),
  constraint guardian_notification_outbox_delivery_check check (
    (status = 'delivered' and delivered_at is not null and failed_at is null)
    or (status = 'failed' and failed_at is not null and delivered_at is null)
    or (status in ('pending', 'cancelled') and delivered_at is null and failed_at is null)
  )
);

create index guardian_notification_outbox_tenant_id_idx
  on public.guardian_notification_outbox(tenant_id);
create index guardian_notification_outbox_guardian_id_idx
  on public.guardian_notification_outbox(guardian_id);
create index guardian_notification_outbox_student_id_idx
  on public.guardian_notification_outbox(student_id);
create index guardian_notification_outbox_event_id_idx
  on public.guardian_notification_outbox(student_trip_event_id);
create index guardian_notification_outbox_pending_idx
  on public.guardian_notification_outbox(tenant_id, status, available_after, created_at)
  where status = 'pending';

create unique index guardian_notification_outbox_event_guardian_type_unique
  on public.guardian_notification_outbox(tenant_id, guardian_id, student_trip_event_id, notification_type);

alter table public.guardian_notification_outbox enable row level security;

revoke all on table public.guardian_notification_outbox from public;
revoke all on table public.guardian_notification_outbox from anon;
revoke all on table public.guardian_notification_outbox from authenticated;

comment on table public.guardian_notification_outbox is
  'Internal tenant-scoped outbox for future guardian pickup/drop-off notification delivery. Milestone 9A records pending work only; it does not send SMS, email, push, webhook, realtime, or provider messages and stores no guardian contact details or message body.';
comment on column public.guardian_notification_outbox.notification_type is
  'Safe event type for a future approved delivery worker; currently student_picked_up or student_dropped_off only.';
comment on column public.guardian_notification_outbox.status is
  'Delivery lifecycle placeholder for a future approved worker. Milestone 9A only inserts pending rows.';
comment on column public.guardian_notification_outbox.failure_reason is
  'Optional non-secret failure summary for a future approved worker; do not store provider payloads, credentials, or sensitive message bodies.';

create or replace function public.record_student_trip_event_for_active_trip(
  p_student_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.driver_trips;
  v_has_pickup boolean;
  v_has_dropoff boolean;
  v_event_id uuid;
  v_notification_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can record student trip events.' using errcode = '42501';
  end if;

  if public.current_tenant_id() is null or public.current_driver_id() is null then
    raise exception 'Driver profile not found.' using errcode = '42501';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.' using errcode = '22004';
  end if;

  if p_event_type not in ('picked_up', 'dropped_off') then
    raise exception 'Invalid student trip event.' using errcode = '22023';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  join public.drivers d
    on d.id = dt.driver_id
    and d.tenant_id = dt.tenant_id
    and d.status = 'active'
  join public.buses b
    on b.id = dt.bus_id
    and b.tenant_id = dt.tenant_id
    and b.status = 'active'
  join public.routes r
    on r.id = dt.route_id
    and r.tenant_id = dt.tenant_id
    and r.status = 'active'
  where dt.tenant_id = public.current_tenant_id()
    and dt.driver_id = public.current_driver_id()
    and dt.status = 'active'
  order by dt.started_at desc
  limit 1
  for update of dt;

  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.students s
    join public.student_route_assignments sra
      on sra.student_id = s.id
      and sra.tenant_id = s.tenant_id
      and sra.route_id = v_trip.route_id
      and sra.status = 'active'
    where s.id = p_student_id
      and s.tenant_id = v_trip.tenant_id
      and s.status = 'active'
  ) then
    raise exception 'Student not found for active trip.' using errcode = 'P0002';
  end if;

  select exists (
           select 1 from public.student_trip_events e
           where e.driver_trip_id = v_trip.id and e.student_id = p_student_id and e.event_type = 'picked_up'
         ),
         exists (
           select 1 from public.student_trip_events e
           where e.driver_trip_id = v_trip.id and e.student_id = p_student_id and e.event_type = 'dropped_off'
         )
  into v_has_pickup, v_has_dropoff;

  if v_has_dropoff then
    raise exception 'Student trip is already complete.' using errcode = '23505';
  end if;

  if p_event_type = 'picked_up' and v_has_pickup then
    raise exception 'Student is already picked up.' using errcode = '23505';
  end if;

  if p_event_type = 'dropped_off' and not v_has_pickup then
    raise exception 'Student must be picked up first.' using errcode = '23514';
  end if;

  insert into public.student_trip_events (
    tenant_id, driver_trip_id, student_id, event_type, created_by
  )
  values (v_trip.tenant_id, v_trip.id, p_student_id, p_event_type, auth.uid())
  returning id into v_event_id;

  v_notification_type := case p_event_type
    when 'picked_up' then 'student_picked_up'
    when 'dropped_off' then 'student_dropped_off'
  end;

  insert into public.guardian_notification_outbox (
    tenant_id,
    guardian_id,
    student_id,
    student_trip_event_id,
    notification_type
  )
  select
    v_trip.tenant_id,
    sg.guardian_id,
    p_student_id,
    v_event_id,
    v_notification_type
  from public.student_guardians sg
  join public.guardians g
    on g.id = sg.guardian_id
    and g.tenant_id = sg.tenant_id
    and g.status = 'active'
  where sg.tenant_id = v_trip.tenant_id
    and sg.student_id = p_student_id
    and sg.status = 'active'
    and sg.can_receive_notifications = true
  on conflict (tenant_id, guardian_id, student_trip_event_id, notification_type) do nothing;
exception
  when unique_violation then
    raise exception 'Student trip event already recorded.' using errcode = '23505';
end;
$$;

comment on function public.record_student_trip_event_for_active_trip(uuid, text) is
  'Internal driver-only student trip event recorder for the authenticated driver''s active trip. Enforces role, tenant, driver ownership, active trip, active student route assignment, and pickup/drop-off ordering, then creates pending guardian notification outbox rows for active linked guardians only. Does not send notifications.';

revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from public;
revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from anon;
revoke all on function public.record_student_trip_event_for_active_trip(uuid, text) from authenticated;
