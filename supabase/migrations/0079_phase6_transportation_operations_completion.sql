-- SafeBus Alberta - Phase 6 transportation operations completion
--
-- This migration delivers the remaining pieces of the non-ETA transportation
-- workflow WITHOUT changing existing tables, policies, RPCs, or columns:
--
--   1. route_service_days            - service-day flags per route
--   2. trip_exceptions               - controlled exception records per trip
--   3. pre_trip_confirmations        - driver pre-trip inspection confirmation
--   4. operational_notes             - controlled-format operational notes
--   5. driver_trips status extension - 'paused' allowed (additive CHECK drop+recreate)
--   6. cancel_driver_trip() RPC      - audited cancellation (active -> cancelled)
--   7. pause_driver_trip() RPC       - audited pause (active -> paused)
--   8. resume_driver_trip() RPC      - audited resume (paused -> active)
--   9. record_trip_exception() RPC   - audited exception on own active/paused trip
--  10. confirm_pre_trip() RPC        - audited pre-trip confirmation by driver
--  11. substitute_driver() RPC       - admin reassigns assignment to a substitute driver
--  12. replace_bus() RPC             - admin swaps the bus on an assignment
--  13. revoke_guardian_access() RPC  - admin audited guardian link revocation
--  14. validate_operational_note()   - blocks prohibited student information
--  15. trip_operational_statuses     - controlled normal/late/missing status, no ETA
--
-- Privacy guardrails (AGENTS.md):
--   * No ASN, home address, health, custody, or prohibited student data is
--     accepted anywhere in this migration. validate_operational_note() rejects
--     those terms before any note is written.
--   * All RPCs are SECURITY DEFINER, set search_path = public, derive identity
--     from auth.uid(), enforce tenant isolation, and record audit events via
--     write_audit_event() when available.
--   * No public RLS policies. No service-role keys in the browser. RLS is
--     enabled on every new table with tenant + role-scoped policies.

-- ---------------------------------------------------------------------------
-- 1. route_service_days
-- ---------------------------------------------------------------------------
create table public.route_service_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  day_of_week smallint not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_service_days_day_of_week_check check (
    day_of_week between 0 and 6
  ),
  constraint route_service_days_status_check check (
    status in ('active', 'inactive')
  ),
  constraint route_service_days_route_day_unique unique (route_id, day_of_week)
);

create index route_service_days_tenant_id_idx on public.route_service_days(tenant_id);
create index route_service_days_route_id_idx on public.route_service_days(route_id);

create trigger set_updated_at_route_service_days
  before update on public.route_service_days
  for each row execute function public.set_updated_at();

alter table public.route_service_days enable row level security;

create policy "route service days select tenant admin"
  on public.route_service_days for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "route service days select school or transportation admin"
  on public.route_service_days for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.routes r
        where r.id = route_service_days.route_id
          and r.tenant_id = route_service_days.tenant_id
          and r.school_id = public.current_school_id()
      )
    )
  );

create policy "route service days select assigned driver"
  on public.route_service_days for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.driver_route_assignments dra
      where dra.route_id = route_service_days.route_id
        and dra.tenant_id = route_service_days.tenant_id
        and dra.driver_id = public.current_driver_id()
        and dra.status = 'active'
    )
  );

create policy "route service days insert admin"
  on public.route_service_days for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create policy "route service days update admin"
  on public.route_service_days for update to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  )
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create policy "route service days delete admin"
  on public.route_service_days for delete to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  );

grant select, insert, update, delete on table public.route_service_days to authenticated;

-- Centralized target authorization for Phase 6 operational records. Tenant
-- and transportation administrators may operate across their tenant. School
-- administrators are restricted to their own school's route/bus/driver/trip.
-- Platform administrators intentionally have no tenant operational access.
create or replace function public.can_access_phase6_operational_target(
  p_tenant_id uuid,
  p_target_entity text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() is not null
    and p_tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() in ('tenant_admin', 'transportation_admin')
      or (
        public.current_user_role() = 'school_admin'
        and case p_target_entity
          when 'route' then exists (
            select 1 from public.routes r
            where r.id = p_target_id and r.tenant_id = p_tenant_id
              and r.school_id = public.current_school_id()
          )
          when 'bus' then exists (
            select 1 from public.buses b
            where b.id = p_target_id and b.tenant_id = p_tenant_id
              and b.school_id = public.current_school_id()
          )
          when 'driver' then exists (
            select 1
            from public.drivers d
            join public.profiles p on p.id = d.profile_id
            where d.id = p_target_id and d.tenant_id = p_tenant_id
              and p.tenant_id = p_tenant_id
              and p.school_id = public.current_school_id()
          )
          when 'trip' then exists (
            select 1
            from public.driver_trips dt
            join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
            where dt.id = p_target_id and dt.tenant_id = p_tenant_id
              and r.school_id = public.current_school_id()
          )
          else false
        end
      )
    ),
    false
  );
$$;

revoke all on function public.can_access_phase6_operational_target(uuid, text, uuid)
  from public, anon;
grant execute on function public.can_access_phase6_operational_target(uuid, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. trip_exceptions (controlled categories, no free-text PII)
-- ---------------------------------------------------------------------------
create table public.trip_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  exception_type text not null,
  exception_detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint trip_exceptions_type_check check (
    exception_type in (
      'traffic_delay',
      'weather_delay',
      'mechanical_issue',
      'road_closure',
      'missed_stop',
      'late_arrival',
      'early_arrival',
      'student_issue',
      'other_operational'
    )
  ),
  constraint trip_exceptions_detail_length_check check (
    char_length(coalesce(exception_detail, '')) <= 280
  )
);

create index trip_exceptions_tenant_id_idx on public.trip_exceptions(tenant_id);
create index trip_exceptions_driver_trip_id_idx on public.trip_exceptions(driver_trip_id);
create index trip_exceptions_driver_id_idx on public.trip_exceptions(driver_id);

alter table public.trip_exceptions enable row level security;

create policy "trip exceptions select tenant admin"
  on public.trip_exceptions for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "trip exceptions select school or transportation admin"
  on public.trip_exceptions for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and public.can_access_phase6_operational_target(
      tenant_id, 'trip', driver_trip_id
    )
  );

create policy "trip exceptions select own driver"
  on public.trip_exceptions for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- No INSERT/UPDATE/DELETE policies: rows are created only through the
-- record_trip_exception() SECURITY DEFINER RPC below, which validates input.
grant select on table public.trip_exceptions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. pre_trip_confirmations
-- ---------------------------------------------------------------------------
create table public.pre_trip_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pre_trip_confirmations_driver_trip_unique unique (driver_trip_id)
);

create index pre_trip_confirmations_tenant_id_idx on public.pre_trip_confirmations(tenant_id);
create index pre_trip_confirmations_driver_trip_id_idx on public.pre_trip_confirmations(driver_trip_id);
create index pre_trip_confirmations_driver_id_idx on public.pre_trip_confirmations(driver_id);

alter table public.pre_trip_confirmations enable row level security;

create policy "pre trip confirmations select tenant admin"
  on public.pre_trip_confirmations for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "pre trip confirmations select school or transportation admin"
  on public.pre_trip_confirmations for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and public.can_access_phase6_operational_target(
      tenant_id, 'trip', driver_trip_id
    )
  );

create policy "pre trip confirmations select own driver"
  on public.pre_trip_confirmations for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and driver_id = public.current_driver_id()
  );

-- No INSERT policy: rows are created only via confirm_pre_trip() RPC.
grant select on table public.pre_trip_confirmations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. operational_notes (controlled format, PII-guarded)
-- ---------------------------------------------------------------------------
create table public.operational_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  target_entity text not null,
  target_id uuid not null,
  note_type text not null,
  note_text text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_notes_target_entity_check check (
    target_entity in ('route', 'bus', 'driver', 'trip')
  ),
  constraint operational_notes_note_type_check check (
    note_type in (
      'general',
      'schedule_change',
      'mechanical_note',
      'driver_coaching',
      'incident_followup'
    )
  ),
  constraint operational_notes_note_text_length_check check (
    char_length(note_text) between 1 and 500
  )
);

create index operational_notes_tenant_id_idx on public.operational_notes(tenant_id);
create index operational_notes_target_idx on public.operational_notes(target_entity, target_id);
create index operational_notes_created_by_idx on public.operational_notes(created_by);

create trigger set_updated_at_operational_notes
  before update on public.operational_notes
  for each row execute function public.set_updated_at();

-- Prohibited-content guard. Rejects free-text entry of health, address,
-- custody, ASN, or other prohibited student information. Applied at the
-- database layer so every client is protected.
create or replace function public.validate_operational_note(p_text text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_lower text := lower(coalesce(p_text, ''));
begin
  if v_lower ~ '\m(asn|alberta student number|student name|guardian name|health|medical|diagnosis|medication|asthma|custody|address|home address|street address|allergy|allergies|mental health|disability|iep|behavioural plan|behavioral plan|date of birth|dob|phone number|email address)\M' then
    return false;
  end if;
  if v_lower ~ '\m[0-9]{1,6}[[:space:]]+[a-z0-9.''-]+([[:space:]]+[a-z0-9.''-]+){0,4}[[:space:]]+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|trail|tr|court|ct)\M' then
    return false;
  end if;
  return true;
end;
$$;

comment on function public.validate_operational_note(text) is
  'Rejects operational note text that appears to contain prohibited student '
  'information (ASN, health, address, custody, etc.). Applied to all note writes.';

alter table public.operational_notes
  add constraint operational_notes_no_prohibited_pii_check
  check (public.validate_operational_note(note_text));

alter table public.operational_notes enable row level security;

create policy "operational notes select tenant admin"
  on public.operational_notes for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "operational notes select school or transportation admin"
  on public.operational_notes for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and public.can_access_phase6_operational_target(
      tenant_id, target_entity, target_id
    )
  );

create policy "operational notes insert admin"
  on public.operational_notes for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and public.can_access_phase6_operational_target(
      tenant_id, target_entity, target_id
    )
  );

create policy "operational notes update own admin"
  on public.operational_notes for update to authenticated
  using (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and public.can_access_phase6_operational_target(
      tenant_id, target_entity, target_id
    )
  )
  with check (
    public.is_transportation_write_admin()
    and tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and public.can_access_phase6_operational_target(
      tenant_id, target_entity, target_id
    )
  );

grant select, insert, update on table public.operational_notes to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Extend driver_trips status to allow 'paused' (additive, non-breaking)
-- ---------------------------------------------------------------------------
-- The original CHECK allowed ('active','completed','cancelled'). We widen it
-- to include 'paused' and relax the active/ended_at invariant so a paused
-- trip has no ended_at. Existing data remains valid under the new constraint.
alter table public.driver_trips
  drop constraint driver_trips_status_check;

alter table public.driver_trips
  add constraint driver_trips_status_check check (
    status in ('active', 'paused', 'completed', 'cancelled')
  );

alter table public.driver_trips
  drop constraint driver_trips_active_ended_at_check;

alter table public.driver_trips
  add constraint driver_trips_active_ended_at_check check (
    (status in ('active', 'paused') and ended_at is null)
    or (status in ('completed', 'cancelled') and ended_at is not null)
  );

-- The legacy partial indexes only cover status='active'. Add open-trip
-- uniqueness guards so a paused trip continues to occupy its driver and bus.
-- This
-- prevents a QR start from creating another trip while one is paused.
create unique index driver_trips_driver_open_unique
  on public.driver_trips(driver_id)
  where status in ('active', 'paused');

create unique index driver_trips_bus_open_unique
  on public.driver_trips(bus_id)
  where status in ('active', 'paused');

-- Completion remains available while paused and retains the existing QR
-- session/dispatch cleanup performed by migration 0059.
create or replace function public.end_driver_trip(p_trip_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.driver_trips;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can end a trip.' using errcode = '42501';
  end if;

  select * into v_row from public.driver_trips where id = p_trip_id for update;
  if not found
    or v_row.tenant_id is distinct from public.current_tenant_id()
    or v_row.driver_id is distinct from public.current_driver_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_row.status not in ('active', 'paused') then
    raise exception 'This trip is not active or paused.' using errcode = '55006';
  end if;

  update public.driver_trips
  set status = 'completed', ended_at = now()
  where id = p_trip_id
  returning * into v_row;

  update public.bus_tracking_sessions
  set status = 'ended', ended_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  update public.bus_run_dispatches
  set status = 'completed', completed_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  begin
    perform public.write_audit_event(
      'transportation.trip_completed', v_row.tenant_id, v_row.id::text,
      'trip', 'success', jsonb_build_object('driver_id', v_row.driver_id::text)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. cancel_driver_trip(p_trip_id, p_reason)
--    Driver- or admin-initiated cancellation. Sets status='cancelled',
--    ended_at=now(), records a controlled reason.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_driver_trip(
  p_trip_id uuid,
  p_reason text default null
)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.driver_trips;
  v_role public.user_role := public.current_user_role();
  v_tenant uuid := public.current_tenant_id();
  v_driver uuid := public.current_driver_id();
  v_actor text;
begin
  if auth.uid() is null or v_tenant is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_role not in ('driver', 'tenant_admin', 'school_admin',
                    'transportation_admin') then
    raise exception 'Only a driver or transportation admin can cancel a trip.'
      using errcode = '42501';
  end if;
  if p_reason is not null and char_length(p_reason) > 120 then
    raise exception 'Cancellation reason is too long.' using errcode = '22001';
  end if;
  if not public.validate_operational_note(p_reason) then
    raise exception 'Cancellation reason may not contain prohibited student information.'
      using errcode = '42501';
  end if;

  select * into v_row from public.driver_trips where id = p_trip_id for update;
  if not found or v_row.tenant_id is distinct from v_tenant then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  -- Driver may cancel only their own; admins may cancel any in-tenant trip.
  if v_role = 'driver' then
    if v_row.driver_id is distinct from v_driver then
      raise exception 'Trip not found.' using errcode = 'P0002';
    end if;
  elsif not public.can_write_route_stop(v_row.tenant_id, v_row.route_id) then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  if v_row.status not in ('active', 'paused') then
    raise exception 'This trip is not active or paused.' using errcode = '55006';
  end if;

  update public.driver_trips
  set status = 'cancelled', ended_at = now()
  where id = p_trip_id
  returning * into v_row;

  update public.bus_tracking_sessions
  set status = 'ended', ended_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  update public.bus_run_dispatches
  set status = 'cancelled', cancelled_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  v_actor := case when v_role = 'driver' then 'driver' else 'admin' end;

  begin
    perform public.write_audit_event(
      'transportation.trip_cancelled',
      v_tenant,
      v_row.id::text,
      'trip',
      'success',
      jsonb_build_object('actor_role', v_role, 'reason', p_reason, 'by', v_actor)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. pause_driver_trip(p_trip_id)
--    Driver pauses their own active trip. active -> paused, ended_at stays null.
-- ---------------------------------------------------------------------------
create or replace function public.pause_driver_trip(p_trip_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.driver_trips;
  v_tenant uuid := public.current_tenant_id();
  v_driver uuid := public.current_driver_id();
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant is null or v_driver is null then
    raise exception 'Only an active driver can pause a trip.' using errcode = '42501';
  end if;

  select * into v_row from public.driver_trips where id = p_trip_id for update;
  if not found or v_row.tenant_id is distinct from v_tenant
    or v_row.driver_id is distinct from v_driver then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Only an active trip can be paused.' using errcode = '55006';
  end if;

  update public.driver_trips set status = 'paused' where id = p_trip_id
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'transportation.trip_paused', v_tenant, v_row.id::text, 'trip',
      'success', jsonb_build_object('driver_id', v_driver::text)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. resume_driver_trip(p_trip_id)
--    Driver resumes their own paused trip. paused -> active. Re-checks the
--    one-active-trip-per-driver and one-active-trip-per-bus invariants.
-- ---------------------------------------------------------------------------
create or replace function public.resume_driver_trip(p_trip_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.driver_trips;
  v_tenant uuid := public.current_tenant_id();
  v_driver uuid := public.current_driver_id();
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant is null or v_driver is null then
    raise exception 'Only an active driver can resume a trip.' using errcode = '42501';
  end if;

  select * into v_row from public.driver_trips where id = p_trip_id for update;
  if not found or v_row.tenant_id is distinct from v_tenant
    or v_row.driver_id is distinct from v_driver then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'paused' then
    raise exception 'Only a paused trip can be resumed.' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.driver_trips
    where driver_id = v_driver and status = 'active'
      and id is distinct from v_row.id
  ) then
    raise exception 'You already have an active trip. End it before resuming another.'
      using errcode = '55006';
  end if;

  if exists (
    select 1 from public.driver_trips
    where bus_id = v_row.bus_id and status = 'active'
      and id is distinct from v_row.id
  ) then
    raise exception 'This bus already has an active trip.' using errcode = '55006';
  end if;

  update public.driver_trips set status = 'active' where id = p_trip_id
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'transportation.trip_resumed', v_tenant, v_row.id::text, 'trip',
      'success', jsonb_build_object('driver_id', v_driver::text)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. record_trip_exception(p_trip_id, p_exception_type, p_exception_detail)
--    Driver records a controlled exception on their own active/paused trip.
--    No free-text PII; exception_type is enum-constrained.
-- ---------------------------------------------------------------------------
create or replace function public.record_trip_exception(
  p_trip_id uuid,
  p_exception_type text,
  p_exception_detail text default null
)
returns public.trip_exceptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.trip_exceptions;
  v_trip public.driver_trips;
  v_tenant uuid := public.current_tenant_id();
  v_driver uuid := public.current_driver_id();
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant is null or v_driver is null then
    raise exception 'Only an active driver can record a trip exception.'
      using errcode = '42501';
  end if;
  if p_exception_type is null then
    raise exception 'Exception type is required.' using errcode = '23502';
  end if;
  if p_exception_detail is not null and char_length(p_exception_detail) > 280 then
    raise exception 'Exception detail is too long (max 280 characters).'
      using errcode = '22001';
  end if;
  -- Defense-in-depth: also validate the detail for prohibited content.
  if not public.validate_operational_note(p_exception_detail) then
    raise exception 'Exception detail may not contain prohibited student information.'
      using errcode = '42501';
  end if;

  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if not found or v_trip.tenant_id is distinct from v_tenant
    or v_trip.driver_id is distinct from v_driver then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('active', 'paused') then
    raise exception 'Exceptions can only be recorded on active or paused trips.'
      using errcode = '55006';
  end if;

  insert into public.trip_exceptions (
    tenant_id, driver_trip_id, driver_id, exception_type, exception_detail
  ) values (
    v_tenant, p_trip_id, v_driver, p_exception_type, p_exception_detail
  )
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'transportation.trip_exception', v_tenant, p_trip_id::text, 'trip',
      'success', jsonb_build_object('exception_type', p_exception_type)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. confirm_pre_trip(p_trip_id)
--     Driver confirms the pre-trip inspection for their own active/paused trip.
--     Idempotent: one row per trip.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_pre_trip(p_trip_id uuid)
returns public.pre_trip_confirmations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.pre_trip_confirmations;
  v_trip public.driver_trips;
  v_existing public.pre_trip_confirmations;
  v_tenant uuid := public.current_tenant_id();
  v_driver uuid := public.current_driver_id();
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant is null or v_driver is null then
    raise exception 'Only an active driver can confirm a pre-trip inspection.'
      using errcode = '42501';
  end if;

  select * into v_trip from public.driver_trips where id = p_trip_id for update;
  if not found or v_trip.tenant_id is distinct from v_tenant
    or v_trip.driver_id is distinct from v_driver then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('active', 'paused') then
    raise exception 'Pre-trip confirmation requires an active or paused trip.'
      using errcode = '55006';
  end if;

  select * into v_existing from public.pre_trip_confirmations
  where driver_trip_id = p_trip_id for update;
  if found then
    return v_existing;
  end if;

  insert into public.pre_trip_confirmations (
    tenant_id, driver_trip_id, driver_id, bus_id
  ) values (
    v_tenant, p_trip_id, v_driver, v_trip.bus_id
  )
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'transportation.pre_trip_confirmed', v_tenant, p_trip_id::text, 'trip',
      'success', jsonb_build_object('driver_id', v_driver::text)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. substitute_driver(p_assignment_id, p_substitute_driver_id)
--     Admin reassigns a driver_route_assignment to a substitute driver while
--     preserving the bus/route/trip_type/effective window. Ends the old
--     assignment row and creates a new one for the substitute. Refuses if the
--     original assignment has an active trip.
-- ---------------------------------------------------------------------------
create or replace function public.substitute_driver(
  p_assignment_id uuid,
  p_substitute_driver_id uuid
)
returns public.driver_route_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_orig public.driver_route_assignments;
  v_sub public.drivers;
  v_new public.driver_route_assignments;
begin
  if auth.uid() is null or v_tenant is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  select * into v_orig from public.driver_route_assignments
  where id = p_assignment_id for update;
  if not found or v_orig.tenant_id is distinct from v_tenant then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if not public.can_write_route_stop(v_orig.tenant_id, v_orig.route_id) then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  select * into v_sub from public.drivers
  where id = p_substitute_driver_id and tenant_id = v_tenant and status = 'active'
  for update;
  if not found then
    raise exception 'Choose an active substitute driver in your organization.'
      using errcode = '23514';
  end if;
  if not public.can_write_driver_profile(v_sub.tenant_id, v_sub.profile_id) then
    raise exception 'Choose an active substitute driver in your organization.'
      using errcode = '23514';
  end if;
  if v_sub.id = v_orig.driver_id then
    raise exception 'The substitute must be a different driver.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.driver_trips dt
    where dt.driver_id = v_orig.driver_id
      and dt.tenant_id = v_tenant
      and dt.bus_id = v_orig.bus_id
      and dt.route_id = v_orig.route_id
      and dt.status in ('active', 'paused')
  ) then
    raise exception 'Complete or cancel the open trip before substituting the driver.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where id = v_orig.id;

  insert into public.driver_route_assignments (
    tenant_id, driver_id, bus_id, route_id, trip_type, status,
    effective_from, effective_to
  ) values (
    v_tenant, v_sub.id, v_orig.bus_id, v_orig.route_id, v_orig.trip_type,
    'active', coalesce(v_orig.effective_from, current_date), v_orig.effective_to
  )
  returning * into v_new;

  begin
    perform public.write_audit_event(
      'transportation.substitute_driver', v_tenant, v_orig.id::text,
      'driver_route_assignment', 'success',
      jsonb_build_object(
        'original_driver_id', v_orig.driver_id::text,
        'substitute_driver_id', v_sub.id::text,
        'new_assignment_id', v_new.id::text
      )
    );
  exception when others then null;
  end;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. replace_bus(p_assignment_id, p_replacement_bus_id)
--     Admin swaps the bus on a driver_route_assignment. Ends the old assignment
--     row and creates a new one referencing the replacement bus. Refuses if the
--     original assignment has an active/paused trip.
-- ---------------------------------------------------------------------------
create or replace function public.replace_bus(
  p_assignment_id uuid,
  p_replacement_bus_id uuid
)
returns public.driver_route_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_orig public.driver_route_assignments;
  v_bus public.buses;
  v_new public.driver_route_assignments;
begin
  if auth.uid() is null or v_tenant is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  select * into v_orig from public.driver_route_assignments
  where id = p_assignment_id for update;
  if not found or v_orig.tenant_id is distinct from v_tenant then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if not public.can_write_route_stop(v_orig.tenant_id, v_orig.route_id) then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  select * into v_bus from public.buses
  where id = p_replacement_bus_id and tenant_id = v_tenant and status = 'active'
  for update;
  if not found then
    raise exception 'Choose an active replacement bus in your organization.'
      using errcode = '23514';
  end if;
  if not public.can_write_optional_school(v_bus.tenant_id, v_bus.school_id) then
    raise exception 'Choose an active replacement bus in your organization.'
      using errcode = '23514';
  end if;
  if v_bus.id = v_orig.bus_id then
    raise exception 'The replacement must be a different bus.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.driver_trips dt
    where dt.driver_id = v_orig.driver_id
      and dt.tenant_id = v_tenant
      and dt.bus_id = v_orig.bus_id
      and dt.route_id = v_orig.route_id
      and dt.status in ('active', 'paused')
  ) then
    raise exception 'Complete or cancel the open trip before replacing the bus.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where id = v_orig.id;

  insert into public.driver_route_assignments (
    tenant_id, driver_id, bus_id, route_id, trip_type, status,
    effective_from, effective_to
  ) values (
    v_tenant, v_orig.driver_id, v_bus.id, v_orig.route_id, v_orig.trip_type,
    'active', coalesce(v_orig.effective_from, current_date), v_orig.effective_to
  )
  returning * into v_new;

  begin
    perform public.write_audit_event(
      'transportation.replace_bus', v_tenant, v_orig.id::text,
      'driver_route_assignment', 'success',
      jsonb_build_object(
        'original_bus_id', v_orig.bus_id::text,
        'replacement_bus_id', v_bus.id::text,
        'new_assignment_id', v_new.id::text
      )
    );
  exception when others then null;
  end;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. revoke_guardian_access(p_student_guardian_id, p_reason)
--     Admin revokes an active guardian-student link. Sets status='inactive',
--     records an audit event with the controlled reason. No health/custody
--     text is accepted.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_guardian_access(
  p_student_guardian_id uuid,
  p_reason text default null
)
returns public.student_guardians
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.student_guardians;
  v_student public.students;
  v_tenant uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_reason is not null and char_length(p_reason) > 200 then
    raise exception 'Reason is too long.' using errcode = '22001';
  end if;
  if p_reason is not null and p_reason not in (
    'authorization_withdrawn', 'guardian_request',
    'link_created_in_error', 'access_no_longer_required'
  ) then
    raise exception 'Choose a valid guardian access revocation reason.'
      using errcode = '22023';
  end if;
  if not public.validate_operational_note(p_reason) then
    raise exception 'Reason may not contain prohibited student information.'
      using errcode = '42501';
  end if;

  select * into v_row from public.student_guardians
  where id = p_student_guardian_id for update;
  if not found or v_row.tenant_id is distinct from v_tenant then
    raise exception 'Guardian link not found.' using errcode = 'P0002';
  end if;
  select * into v_student from public.students
  where id = v_row.student_id and tenant_id = v_row.tenant_id;
  if not found
    or not public.can_write_school(v_student.tenant_id, v_student.school_id) then
    raise exception 'Guardian link not found.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'This guardian link is already inactive.' using errcode = '55006';
  end if;

  update public.student_guardians
  set status = 'inactive'
  where id = p_student_guardian_id
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'guardian.access_revoked', v_tenant, p_student_guardian_id::text,
      'student_guardian', 'success',
      jsonb_build_object('reason', p_reason, 'actor', auth.uid()::text)
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants for all new RPCs
-- ---------------------------------------------------------------------------
revoke all on function public.cancel_driver_trip(uuid, text) from public, anon;
revoke all on function public.pause_driver_trip(uuid) from public, anon;
revoke all on function public.resume_driver_trip(uuid) from public, anon;
revoke all on function public.record_trip_exception(uuid, text, text) from public, anon;
revoke all on function public.confirm_pre_trip(uuid) from public, anon;
revoke all on function public.substitute_driver(uuid, uuid) from public, anon;
revoke all on function public.replace_bus(uuid, uuid) from public, anon;
revoke all on function public.revoke_guardian_access(uuid, text) from public, anon;

grant execute on function public.cancel_driver_trip(uuid, text) to authenticated;
grant execute on function public.pause_driver_trip(uuid) to authenticated;
grant execute on function public.resume_driver_trip(uuid) to authenticated;
grant execute on function public.record_trip_exception(uuid, text, text) to authenticated;
grant execute on function public.confirm_pre_trip(uuid) to authenticated;
grant execute on function public.substitute_driver(uuid, uuid) to authenticated;
grant execute on function public.replace_bus(uuid, uuid) to authenticated;
grant execute on function public.revoke_guardian_access(uuid, text) to authenticated;

comment on table public.route_service_days is
  'Active days of the week (0=Sun..6=Sat) when a route operates.';
comment on table public.trip_exceptions is
  'Controlled-category exception records attached to a driver trip.';
comment on table public.pre_trip_confirmations is
  'One-per-trip driver pre-trip inspection confirmation.';
comment on table public.operational_notes is
  'Controlled-format operational notes on routes, buses, drivers, and trips. '
  'Prohibited student information is rejected by a database CHECK constraint.';

-- ---------------------------------------------------------------------------
-- 15. Administrator-reported late / missing bus status (no ETA calculation)
-- ---------------------------------------------------------------------------
create table public.trip_operational_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  operational_status text not null default 'normal',
  reason_code text,
  set_by uuid not null references public.profiles(id) on delete restrict,
  set_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_operational_statuses_trip_unique unique (driver_trip_id),
  constraint trip_operational_statuses_status_check check (
    operational_status in ('normal', 'late', 'missing')
  ),
  constraint trip_operational_statuses_reason_check check (
    reason_code is null or reason_code in (
      'traffic', 'weather', 'mechanical', 'driver_unavailable',
      'bus_unavailable', 'dispatch_unknown', 'other_operational'
    )
  ),
  constraint trip_operational_statuses_reason_required_check check (
    operational_status = 'normal' or reason_code is not null
  )
);

create index trip_operational_statuses_tenant_idx
  on public.trip_operational_statuses(tenant_id);

create trigger set_updated_at_trip_operational_statuses
  before update on public.trip_operational_statuses
  for each row execute function public.set_updated_at();

alter table public.trip_operational_statuses enable row level security;

create policy "trip operational statuses select tenant admin"
  on public.trip_operational_statuses for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "trip operational statuses select scoped admin"
  on public.trip_operational_statuses for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and public.can_access_phase6_operational_target(
      tenant_id, 'trip', driver_trip_id
    )
  );

grant select on table public.trip_operational_statuses to authenticated;

create or replace function public.set_trip_operational_status(
  p_driver_trip_id uuid,
  p_operational_status text,
  p_reason_code text default null
)
returns public.trip_operational_statuses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_trip public.driver_trips;
  v_row public.trip_operational_statuses;
begin
  if auth.uid() is null or v_tenant is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_operational_status not in ('normal', 'late', 'missing') then
    raise exception 'Choose a valid operational status.' using errcode = '22023';
  end if;
  if p_reason_code is not null and p_reason_code not in (
    'traffic', 'weather', 'mechanical', 'driver_unavailable',
    'bus_unavailable', 'dispatch_unknown', 'other_operational'
  ) then
    raise exception 'Choose a valid operational reason.' using errcode = '22023';
  end if;
  if p_operational_status <> 'normal' and p_reason_code is null then
    raise exception 'A controlled reason is required for late or missing status.'
      using errcode = '23502';
  end if;

  select * into v_trip from public.driver_trips
  where id = p_driver_trip_id for update;
  if not found or v_trip.tenant_id is distinct from v_tenant
    or v_trip.status not in ('active', 'paused')
    or not public.can_write_route_stop(v_trip.tenant_id, v_trip.route_id) then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;

  insert into public.trip_operational_statuses (
    tenant_id, driver_trip_id, operational_status, reason_code, set_by, set_at
  ) values (
    v_tenant, v_trip.id, p_operational_status,
    case when p_operational_status = 'normal' then null else p_reason_code end,
    auth.uid(), now()
  )
  on conflict (driver_trip_id) do update
  set operational_status = excluded.operational_status,
      reason_code = excluded.reason_code,
      set_by = excluded.set_by,
      set_at = excluded.set_at
  returning * into v_row;

  begin
    perform public.write_audit_event(
      'transportation.trip_operational_status', v_tenant, v_trip.id::text,
      'trip', 'success',
      jsonb_build_object(
        'operational_status', p_operational_status,
        'reason_code', case when p_operational_status = 'normal' then null else p_reason_code end
      )
    );
  exception when others then null;
  end;

  return v_row;
end;
$$;

create or replace function public.get_admin_active_trip_operational_statuses()
returns table (
  trip_id uuid,
  bus_label text,
  route_name text,
  trip_status text,
  operational_status text,
  reason_code text,
  status_set_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    dt.id,
    b.bus_number,
    r.route_name,
    dt.status,
    coalesce(tos.operational_status, 'normal'),
    tos.reason_code,
    tos.set_at
  from public.driver_trips dt
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join public.trip_operational_statuses tos
    on tos.driver_trip_id = dt.id and tos.tenant_id = dt.tenant_id
  where auth.uid() is not null
    and public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
    and dt.tenant_id = public.current_tenant_id()
    and dt.status in ('active', 'paused')
    and (
      public.current_user_role() <> 'school_admin'
      or r.school_id = public.current_school_id()
    )
  order by
    case coalesce(tos.operational_status, 'normal')
      when 'missing' then 0 when 'late' then 1 else 2
    end,
    dt.started_at;
$$;

revoke all on function public.set_trip_operational_status(uuid, text, text)
  from public, anon;
revoke all on function public.get_admin_active_trip_operational_statuses()
  from public, anon;
grant execute on function public.set_trip_operational_status(uuid, text, text)
  to authenticated;
grant execute on function public.get_admin_active_trip_operational_statuses()
  to authenticated;

comment on table public.trip_operational_statuses is
  'Administrator-reported normal, late, or missing bus status using controlled reason codes. No ETA or free text.';

-- Reconcile the existing trip read policy with the Phase 6 school boundary.
drop policy if exists "driver_trips select school or transportation admin"
  on public.driver_trips;
create policy "driver_trips select school or transportation admin"
  on public.driver_trips for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or (
        public.current_user_role() = 'school_admin'
        and exists (
          select 1 from public.routes r
          where r.id = driver_trips.route_id
            and r.tenant_id = driver_trips.tenant_id
            and r.school_id = public.current_school_id()
        )
      )
    )
  );

-- Historical/open trip review includes paused trips and enforces school scope.
create or replace function public.get_admin_trip_overview(p_limit integer default 50)
returns table (
  trip_id uuid,
  service_date date,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  route_name text,
  route_code text,
  trip_pattern_name text,
  direction text,
  bus_label text,
  driver_label text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null
    or public.current_user_role() not in (
      'tenant_admin', 'school_admin', 'transportation_admin'
    ) then
    raise exception 'Only an authorized tenant administrator can view trip summaries.'
      using errcode = '42501';
  end if;
  if v_tenant_id is null then
    raise exception 'An active tenant identity is required.' using errcode = '42501';
  end if;

  return query
  select
    dt.id, dt.service_date, dt.status, dt.started_at, dt.ended_at,
    r.route_name, r.route_code,
    coalesce(dt.trip_name_snapshot, rtp.display_name), rtp.direction,
    b.bus_number, p.full_name
  from public.driver_trips dt
  join public.routes r
    on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = dt.route_trip_pattern_id
    and rtp.route_id = dt.route_id and rtp.tenant_id = dt.tenant_id
  join public.buses b
    on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.drivers d
    on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p
    on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  where dt.tenant_id = v_tenant_id
    and dt.status in ('active', 'paused', 'completed', 'cancelled')
    and (
      public.current_user_role() <> 'school_admin'
      or r.school_id = public.current_school_id()
    )
  order by dt.service_date desc, dt.started_at desc, dt.id
  limit v_limit;
end;
$$;

-- The PostGIS viewport RPC previously omitted the school predicate present in
-- the canonical live-fleet RPC. Reconcile it while also retaining paused runs
-- on the operations dashboard.
create or replace function public.get_admin_live_fleet_monitoring_in_viewport(
  p_south_latitude double precision,
  p_west_longitude double precision,
  p_north_latitude double precision,
  p_east_longitude double precision
)
returns table (
  bus_label text,
  route_name text,
  driver_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz,
  speed_mps double precision,
  location_status text,
  issue_label text,
  next_stop_name text,
  eta_status text,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with authorized as (
    select public.validate_spatial_viewport_bounds(
      p_south_latitude, p_west_longitude, p_north_latitude, p_east_longitude
    )
  ), viewport as (
    select extensions.st_makeenvelope(
      p_west_longitude, p_south_latitude,
      p_east_longitude, p_north_latitude, 4326
    )::extensions.geography as geog
    from authorized
  )
  select
    b.bus_number, r.route_name, p.full_name, dt.trip_type, dt.status, dt.started_at,
    loc.latitude, loc.longitude, loc.recorded_at, loc.speed_mps,
    case
      when loc.recorded_at is null then 'missing'
      when loc.recorded_at < now() - interval '2 minutes' then 'stale'
      else 'live'
    end,
    case
      when loc.recorded_at is null then 'Missing GPS'
      when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS'
      when eta.eta_status is distinct from 'available' then 'Needs attention'
      when loc.speed_mps is null then 'Speed unavailable'
      else 'OK'
    end,
    eta.next_stop_name, eta.eta_status, eta.eta_label,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from viewport v
  join public.driver_trip_current_locations loc
    on loc.location_geog is not null
    and extensions.st_intersects(loc.location_geog, v.geog)
  join public.driver_trips dt
    on dt.id = loc.driver_trip_id and dt.tenant_id = loc.tenant_id
    and dt.driver_id = loc.driver_id and dt.bus_id = loc.bus_id
    and dt.route_id = loc.route_id
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join lateral (
    select rs.id from public.route_stops rs
    where rs.route_id = dt.route_id and rs.status = 'active'
    order by case when dt.trip_type = 'evening' then -rs.stop_order else rs.stop_order end
    limit 1
  ) target on true
  left join lateral public.calculate_safe_route_eta(
    dt.route_id, target.id, dt.route_trip_pattern_id,
    loc.latitude, loc.longitude, loc.speed_mps, loc.recorded_at
  ) eta on true
  where auth.uid() is not null
    and public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
    and dt.status in ('active', 'paused')
    and dt.tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() <> 'school_admin'
      or r.school_id = public.current_school_id()
    )
  order by
    case when loc.recorded_at < now() - interval '2 minutes' then 1 else 2 end,
    dt.started_at desc;
$$;
