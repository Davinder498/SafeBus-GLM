-- SafeBus Alberta - secure real-time active-trip invalidations
--
-- Realtime carries only a coordinate-free invalidation signal. Admin and
-- guardian clients must refetch their existing SECURITY DEFINER RPCs; the
-- accepted server-side authorization and freshness contracts remain the only
-- source of displayable coordinates.

-- Browser clients may receive authorized private broadcasts, but may never
-- publish messages themselves.
revoke insert on table realtime.messages from authenticated;
grant select on table realtime.messages to authenticated;

drop policy if exists "safebus tracking broadcast receive" on realtime.messages;

create policy "safebus tracking broadcast receive"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (
        realtime.topic() = 'safebus:guardian:' || auth.uid()::text
        and public.current_user_role() = 'guardian'
        and exists (
          select 1
          from public.guardians g
          where g.profile_id = auth.uid()
            and g.tenant_id = public.current_tenant_id()
            and g.status = 'active'
        )
      )
      or
      (
        public.current_tenant_id() is not null
        and realtime.topic() = 'safebus:tenant:' || public.current_tenant_id()::text
        and public.current_user_role() in (
          'tenant_admin',
          'school_admin',
          'transportation_admin'
        )
      )
    )
  );

create or replace function public.send_tracking_invalidation(
  p_topic text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  if p_topic is null or p_reason is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'reason', p_reason,
      'occurred_at', statement_timestamp()
    ),
    'tracking_changed',
    p_topic,
    true
  );
end;
$$;

revoke all on function public.send_tracking_invalidation(text, text) from public, anon, authenticated;

create or replace function public.send_guardian_tracking_invalidation(
  p_profile_id uuid,
  p_reason text
)
returns void
language sql
security definer
set search_path = public, realtime, pg_temp
as $$
  select public.send_tracking_invalidation(
    'safebus:guardian:' || p_profile_id::text,
    p_reason
  )
  where p_profile_id is not null;
$$;

revoke all on function public.send_guardian_tracking_invalidation(uuid, text) from public, anon, authenticated;

create or replace function public.broadcast_student_guardian_tracking_invalidation(
  p_tenant_id uuid,
  p_student_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select distinct g.profile_id
    from public.student_guardians sg
    join public.guardians g
      on g.id = sg.guardian_id
     and g.tenant_id = sg.tenant_id
    where sg.tenant_id = p_tenant_id
      and sg.student_id = p_student_id
  loop
    perform public.send_guardian_tracking_invalidation(v_profile_id, p_reason);
  end loop;
end;
$$;

revoke all on function public.broadcast_student_guardian_tracking_invalidation(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.broadcast_route_tracking_invalidation(
  p_tenant_id uuid,
  p_route_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if p_tenant_id is null then
    return;
  end if;

  perform public.send_tracking_invalidation(
    'safebus:tenant:' || p_tenant_id::text,
    p_reason
  );

  if p_route_id is null then
    return;
  end if;

  for v_profile_id in
    select distinct g.profile_id
    from public.student_route_assignments sra
    join public.students s
      on s.id = sra.student_id
     and s.tenant_id = sra.tenant_id
     and s.status = 'active'
    join public.student_guardians sg
      on sg.student_id = s.id
     and sg.tenant_id = s.tenant_id
     and sg.status = 'active'
    join public.guardians g
      on g.id = sg.guardian_id
     and g.tenant_id = sg.tenant_id
     and g.status = 'active'
    where sra.tenant_id = p_tenant_id
      and sra.route_id = p_route_id
      and sra.status = 'active'
      and sra.effective_from <= current_date
      and (sra.effective_to is null or sra.effective_to >= current_date)
  loop
    perform public.send_guardian_tracking_invalidation(v_profile_id, p_reason);
  end loop;
end;
$$;

revoke all on function public.broadcast_route_tracking_invalidation(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.notify_tracking_location_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  perform public.broadcast_route_tracking_invalidation(
    new.tenant_id,
    new.route_id,
    'location'
  );
  return null;
end;
$$;

create trigger notify_tracking_location_change
  after insert or update on public.driver_trip_current_locations
  for each row execute function public.notify_tracking_location_change();

create or replace function public.notify_tracking_trip_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.broadcast_route_tracking_invalidation(
      old.tenant_id,
      old.route_id,
      'trip'
    );
  end if;

  if tg_op <> 'DELETE' then
    perform public.broadcast_route_tracking_invalidation(
      new.tenant_id,
      new.route_id,
      'trip'
    );
  end if;
  return null;
end;
$$;

create trigger notify_tracking_trip_change
  after insert or update or delete on public.driver_trips
  for each row execute function public.notify_tracking_trip_change();

create or replace function public.notify_tracking_student_route_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.broadcast_route_tracking_invalidation(old.tenant_id, old.route_id, 'authorization');
    perform public.broadcast_student_guardian_tracking_invalidation(
      old.tenant_id,
      old.student_id,
      'authorization'
    );
  end if;
  if tg_op <> 'DELETE' then
    perform public.broadcast_route_tracking_invalidation(new.tenant_id, new.route_id, 'authorization');
    perform public.broadcast_student_guardian_tracking_invalidation(
      new.tenant_id,
      new.student_id,
      'authorization'
    );
  end if;
  return null;
end;
$$;

create trigger notify_tracking_student_route_assignment_change
  after insert or update or delete on public.student_route_assignments
  for each row execute function public.notify_tracking_student_route_assignment_change();

create or replace function public.notify_tracking_student_guardian_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_profile_id uuid;
begin
  for v_guardian_id in
    select distinct guardian_id
    from (values
      (case when tg_op <> 'INSERT' then old.guardian_id end),
      (case when tg_op <> 'DELETE' then new.guardian_id end)
    ) ids(guardian_id)
    where guardian_id is not null
  loop
    select g.profile_id into v_profile_id
    from public.guardians g
    where g.id = v_guardian_id;
    perform public.send_guardian_tracking_invalidation(v_profile_id, 'authorization');
  end loop;
  return null;
end;
$$;

create trigger notify_tracking_student_guardian_change
  after insert or update or delete on public.student_guardians
  for each row execute function public.notify_tracking_student_guardian_change();

create or replace function public.notify_tracking_guardian_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.send_guardian_tracking_invalidation(old.profile_id, 'authorization');
  end if;
  if tg_op <> 'DELETE' then
    perform public.send_guardian_tracking_invalidation(new.profile_id, 'authorization');
  end if;
  return null;
end;
$$;

create trigger notify_tracking_guardian_change
  after insert or update or delete on public.guardians
  for each row execute function public.notify_tracking_guardian_change();

create or replace function public.notify_tracking_student_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_profile_id uuid;
  v_student_id uuid;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_student_id := old.id;
    v_tenant_id := old.tenant_id;
  else
    v_student_id := new.id;
    v_tenant_id := new.tenant_id;
  end if;

  for v_profile_id in
    select distinct g.profile_id
    from public.student_guardians sg
    join public.guardians g
      on g.id = sg.guardian_id
     and g.tenant_id = sg.tenant_id
    where sg.student_id = v_student_id
      and sg.tenant_id = v_tenant_id
  loop
    perform public.send_guardian_tracking_invalidation(v_profile_id, 'authorization');
  end loop;
  return null;
end;
$$;

create trigger notify_tracking_student_change
  after update or delete on public.students
  for each row execute function public.notify_tracking_student_change();

create or replace function public.notify_tracking_operational_entity_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_trip record;
  v_entity_id uuid;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id;
    v_tenant_id := old.tenant_id;
  else
    v_entity_id := new.id;
    v_tenant_id := new.tenant_id;
  end if;

  for v_trip in
    select distinct dt.route_id
    from public.driver_trips dt
    where dt.tenant_id = v_tenant_id
      and dt.status = 'active'
      and (
        (tg_table_name = 'routes' and dt.route_id = v_entity_id)
        or (tg_table_name = 'buses' and dt.bus_id = v_entity_id)
        or (tg_table_name = 'drivers' and dt.driver_id = v_entity_id)
      )
  loop
    perform public.broadcast_route_tracking_invalidation(v_tenant_id, v_trip.route_id, 'authorization');
  end loop;
  return null;
end;
$$;

create trigger notify_tracking_route_change
  after update or delete on public.routes
  for each row execute function public.notify_tracking_operational_entity_change();

create trigger notify_tracking_bus_change
  after update or delete on public.buses
  for each row execute function public.notify_tracking_operational_entity_change();

create trigger notify_tracking_driver_change
  after update or delete on public.drivers
  for each row execute function public.notify_tracking_operational_entity_change();

create or replace function public.notify_tracking_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  perform public.send_guardian_tracking_invalidation(old.id, 'authorization');
  perform public.send_guardian_tracking_invalidation(new.id, 'authorization');

  if old.tenant_id is not null then
    perform public.send_tracking_invalidation('safebus:tenant:' || old.tenant_id::text, 'authorization');
  end if;
  if new.tenant_id is not null then
    perform public.send_tracking_invalidation('safebus:tenant:' || new.tenant_id::text, 'authorization');
  end if;
  return null;
end;
$$;

create trigger notify_tracking_profile_change
  after update on public.profiles
  for each row execute function public.notify_tracking_profile_change();

-- Lookup support for route-to-guardian invalidation fanout.
create index if not exists student_route_assignments_route_active_idx
  on public.student_route_assignments(tenant_id, route_id, student_id)
  where status = 'active';

create index if not exists student_guardians_student_active_idx
  on public.student_guardians(tenant_id, student_id, guardian_id)
  where status = 'active';

comment on policy "safebus tracking broadcast receive" on realtime.messages is
  'Receive-only private tracking invalidations. Exact guardian-user and tenant-admin topics are authorized server-side; messages contain no coordinates.';
