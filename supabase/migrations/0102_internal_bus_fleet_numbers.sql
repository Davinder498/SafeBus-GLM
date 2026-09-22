-- SafeBus Alberta - internal fleet numbers for tenant bus administration (0102)
--
-- The public buses row remains the minimum operational record shared with
-- assigned drivers. The internal fleet number lives in a separate RLS table so
-- it cannot be selected through driver, guardian, or platform-admin bus access.

alter table public.buses
  add constraint buses_id_tenant_unique unique (id, tenant_id);

create table public.bus_admin_details (
  bus_id uuid primary key,
  tenant_id uuid not null,
  fleet_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bus_admin_details_bus_tenant_fkey
    foreign key (bus_id, tenant_id)
    references public.buses (id, tenant_id)
    on delete cascade,
  constraint bus_admin_details_fleet_number_check check (
    length(fleet_number) between 1 and 40
    and fleet_number = regexp_replace(btrim(fleet_number), '[[:space:]]+', ' ', 'g')
  )
);

create unique index bus_admin_details_tenant_fleet_number_unique
  on public.bus_admin_details (tenant_id, lower(fleet_number));

create index bus_admin_details_tenant_id_idx
  on public.bus_admin_details (tenant_id);

create trigger set_updated_at_bus_admin_details
  before update on public.bus_admin_details
  for each row execute function public.set_updated_at();

alter table public.bus_admin_details enable row level security;

create policy "bus admin details select scoped administrators"
  on public.bus_admin_details
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles caller
      join public.buses bus
        on bus.id = bus_admin_details.bus_id
       and bus.tenant_id = bus_admin_details.tenant_id
      where caller.id = (select auth.uid())
        and caller.status = 'active'
        and caller.tenant_id = bus_admin_details.tenant_id
        and caller.role in ('tenant_admin', 'transportation_admin', 'school_admin')
        and (
          caller.role <> 'school_admin'
          or (
            caller.school_id is not null
            and bus.school_id = caller.school_id
          )
        )
    )
  );

revoke all on table public.bus_admin_details from public, anon, authenticated;
grant select on table public.bus_admin_details to authenticated;

-- Bus creation and detail edits must pass through the atomic admin RPCs below.
-- Keep existing read/delete grants and operational bus access unchanged.
revoke insert, update on table public.buses from authenticated;

create or replace function public.admin_create_bus(
  p_school_id uuid,
  p_bus_number text,
  p_fleet_number text,
  p_license_plate text,
  p_capacity integer,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_bus public.buses;
  v_bus_number text := btrim(coalesce(p_bus_number, ''));
  v_fleet_number text := regexp_replace(btrim(coalesce(p_fleet_number, '')), '[[:space:]]+', ' ', 'g');
  v_license_plate text := nullif(upper(regexp_replace(btrim(coalesce(p_license_plate, '')), '[[:space:]]+', '', 'g')), '');
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role not in ('tenant_admin', 'transportation_admin', 'school_admin') then
    raise exception 'An active tenant bus administrator is required.' using errcode = '42501';
  end if;

  if v_caller.role = 'school_admin'
    and (v_caller.school_id is null or p_school_id is distinct from v_caller.school_id) then
    raise exception 'School administrators can only create buses for their assigned school.'
      using errcode = '42501';
  end if;

  if p_school_id is not null and not exists (
    select 1 from public.schools school
    where school.id = p_school_id and school.tenant_id = v_caller.tenant_id
  ) then
    raise exception 'School not found in your organization.' using errcode = 'P0002';
  end if;

  if v_bus_number = '' or length(v_bus_number) > 40 then
    raise exception 'Enter a bus number up to 40 characters.' using errcode = '22023';
  end if;
  if v_fleet_number = '' or length(v_fleet_number) > 40 then
    raise exception 'Enter a fleet number up to 40 characters.' using errcode = '22023';
  end if;
  if length(coalesce(v_license_plate, '')) > 40 then
    raise exception 'Enter a licence plate up to 40 characters.' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity < 0 then
    raise exception 'Capacity must be zero or greater.' using errcode = '22023';
  end if;
  if p_status not in ('active', 'maintenance', 'inactive', 'retired') then
    raise exception 'Invalid bus status.' using errcode = '22023';
  end if;

  insert into public.buses (
    tenant_id, school_id, bus_number, license_plate, capacity, status
  ) values (
    v_caller.tenant_id, p_school_id, v_bus_number, v_license_plate, p_capacity, p_status
  ) returning * into v_bus;

  insert into public.bus_admin_details (bus_id, tenant_id, fleet_number)
  values (v_bus.id, v_bus.tenant_id, v_fleet_number);

  perform safebus_private.write_audit_event(
    'bus.created', 'bus', v_bus.id, v_bus.bus_number, 'success',
    jsonb_build_object('changed_fields', jsonb_build_array(
      'bus_number', 'fleet_number', 'license_plate', 'capacity', 'school_id', 'status'
    )),
    null
  );

  return to_jsonb(v_bus) || jsonb_build_object('fleet_number', v_fleet_number);
end;
$$;

create or replace function public.admin_update_bus(
  p_bus_id uuid,
  p_school_id uuid,
  p_fleet_number text,
  p_license_plate text,
  p_capacity integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_bus public.buses;
  v_fleet_number text := regexp_replace(btrim(coalesce(p_fleet_number, '')), '[[:space:]]+', ' ', 'g');
  v_license_plate text := nullif(upper(regexp_replace(btrim(coalesce(p_license_plate, '')), '[[:space:]]+', '', 'g')), '');
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role not in ('tenant_admin', 'transportation_admin', 'school_admin') then
    raise exception 'An active tenant bus administrator is required.' using errcode = '42501';
  end if;

  select * into v_bus
  from public.buses
  where id = p_bus_id and tenant_id = v_caller.tenant_id
  for update;

  if v_bus.id is null then
    raise exception 'Bus not found.' using errcode = 'P0002';
  end if;
  if v_caller.role = 'school_admin'
    and (
      v_caller.school_id is null
      or v_bus.school_id is distinct from v_caller.school_id
      or p_school_id is distinct from v_caller.school_id
    ) then
    raise exception 'School administrators can only update buses for their assigned school.'
      using errcode = '42501';
  end if;
  if p_school_id is not null and not exists (
    select 1 from public.schools school
    where school.id = p_school_id and school.tenant_id = v_caller.tenant_id
  ) then
    raise exception 'School not found in your organization.' using errcode = 'P0002';
  end if;

  if v_fleet_number = '' or length(v_fleet_number) > 40 then
    raise exception 'Enter a fleet number up to 40 characters.' using errcode = '22023';
  end if;
  if length(coalesce(v_license_plate, '')) > 40 then
    raise exception 'Enter a licence plate up to 40 characters.' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity < 0 then
    raise exception 'Capacity must be zero or greater.' using errcode = '22023';
  end if;
  if p_status not in ('active', 'maintenance', 'inactive', 'retired') then
    raise exception 'Invalid bus status.' using errcode = '22023';
  end if;

  update public.buses
  set school_id = p_school_id,
      license_plate = v_license_plate,
      capacity = p_capacity,
      status = p_status
  where id = v_bus.id
  returning * into v_bus;

  insert into public.bus_admin_details (bus_id, tenant_id, fleet_number)
  values (v_bus.id, v_bus.tenant_id, v_fleet_number)
  on conflict (bus_id) do update
  set fleet_number = excluded.fleet_number;

  perform safebus_private.write_audit_event(
    'bus.details_updated', 'bus', v_bus.id, v_bus.bus_number, 'success',
    jsonb_build_object('changed_fields', jsonb_build_array(
      'fleet_number', 'license_plate', 'capacity', 'school_id', 'status'
    )),
    null
  );

  return to_jsonb(v_bus) || jsonb_build_object('fleet_number', v_fleet_number);
end;
$$;

revoke all on function public.admin_create_bus(uuid, text, text, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_update_bus(uuid, uuid, text, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_create_bus(uuid, text, text, text, integer, text)
  to authenticated;
grant execute on function public.admin_update_bus(uuid, uuid, text, text, integer, text)
  to authenticated;

create or replace function public.get_admin_buses_page(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_status text default null,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := case when p_page_size in (25, 50, 100) then p_page_size else 50 end;
  v_offset integer;
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_result jsonb;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role not in ('tenant_admin', 'transportation_admin', 'school_admin') then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  v_offset := (v_page - 1) * v_size;

  with filtered as (
    select
      bus.id,
      bus.tenant_id,
      bus.school_id,
      bus.bus_number,
      detail.fleet_number,
      bus.license_plate,
      bus.capacity,
      bus.status,
      bus.created_at,
      bus.updated_at,
      school.name as school_name
    from public.buses bus
    left join public.bus_admin_details detail
      on detail.bus_id = bus.id and detail.tenant_id = bus.tenant_id
    left join public.schools school on school.id = bus.school_id
    where bus.tenant_id = v_caller.tenant_id
      and (p_status is null or bus.status = p_status)
      and (p_school_id is null or bus.school_id = p_school_id)
      and (
        btrim(coalesce(p_search, '')) = ''
        or lower(concat_ws(
          ' ', bus.bus_number, detail.fleet_number, bus.license_plate, school.name, bus.status
        )) like v_search
      )
  ), page_rows as (
    select * from filtered
    order by bus_number, id
    limit v_size offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size
  ) into v_result
  from page_rows;

  return v_result;
end;
$$;

revoke all on function public.get_admin_buses_page(integer, integer, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_buses_page(integer, integer, text, text, uuid)
  to authenticated;

drop function public.search_admin_buses(text, integer);
create function public.search_admin_buses(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  bus_number text,
  fleet_number text,
  license_plate text,
  capacity integer
)
language sql
stable
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select bus.id, bus.bus_number, detail.fleet_number, bus.license_plate, bus.capacity
  from public.buses bus
  left join public.bus_admin_details detail
    on detail.bus_id = bus.id and detail.tenant_id = bus.tenant_id
  join public.profiles caller
    on caller.id = auth.uid()
   and caller.status = 'active'
   and caller.role = 'tenant_admin'
   and caller.tenant_id = bus.tenant_id
  where bus.status = 'active'
    and (
      lower(bus.bus_number) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(detail.fleet_number, '')) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(bus.license_plate, '')) like '%' || lower(btrim(p_search)) || '%'
    )
  order by bus.bus_number, bus.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_admin_buses(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_admin_buses(text, integer) to authenticated;

create or replace function public.get_admin_bus_workspace(p_bus_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_bus jsonb;
  v_routes jsonb;
  v_drivers jsonb;
  v_students jsonb;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role not in ('tenant_admin', 'transportation_admin', 'school_admin') then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  select to_jsonb(bus_row)
  into v_bus
  from (
    select
      bus.id,
      bus.tenant_id,
      bus.school_id,
      bus.bus_number,
      detail.fleet_number,
      bus.license_plate,
      bus.capacity,
      bus.status,
      bus.created_at,
      bus.updated_at,
      school.name as school_name
    from public.buses bus
    left join public.bus_admin_details detail
      on detail.bus_id = bus.id and detail.tenant_id = bus.tenant_id
    left join public.schools school
      on school.id = bus.school_id and school.tenant_id = bus.tenant_id
    where bus.id = p_bus_id
      and bus.tenant_id = v_caller.tenant_id
  ) bus_row;

  if v_bus is null then
    raise exception 'Bus not found.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(route_row) order by route_row.created_at desc), '[]'::jsonb)
  into v_routes
  from (
    select
      assignment.id,
      assignment.tenant_id,
      assignment.bus_id,
      assignment.route_id,
      assignment.route_trip_pattern_id,
      assignment.trip_type,
      assignment.effective_from,
      assignment.effective_to,
      assignment.status,
      assignment.created_at,
      assignment.updated_at,
      route.route_name,
      route.route_code,
      route.status as route_status,
      coalesce(pattern.display_name, assignment.trip_type) as trip_name,
      coalesce(
        pattern.direction,
        case when assignment.trip_type = 'evening' then 'reverse' else 'forward' end
      ) as direction,
      exists (
        select 1
        from public.driver_route_assignments driver_assignment
        join public.driver_trips trip
          on trip.driver_route_assignment_id = driver_assignment.id
         and trip.tenant_id = driver_assignment.tenant_id
         and trip.status = 'active'
        where driver_assignment.bus_route_assignment_id = assignment.id
          and driver_assignment.tenant_id = assignment.tenant_id
      ) as has_active_trip
    from public.bus_route_assignments assignment
    join public.routes route
      on route.id = assignment.route_id and route.tenant_id = assignment.tenant_id
    left join public.route_trip_patterns pattern
      on pattern.id = assignment.route_trip_pattern_id
     and pattern.route_id = assignment.route_id
     and pattern.tenant_id = assignment.tenant_id
    where assignment.bus_id = p_bus_id
      and assignment.tenant_id = v_caller.tenant_id
  ) route_row;

  select coalesce(jsonb_agg(to_jsonb(driver_row) order by driver_row.created_at desc), '[]'::jsonb)
  into v_drivers
  from (
    select
      assignment.id,
      assignment.tenant_id,
      assignment.driver_id,
      assignment.bus_id,
      assignment.route_id,
      assignment.route_trip_pattern_id,
      assignment.bus_route_assignment_id,
      assignment.trip_type,
      assignment.status,
      assignment.effective_from,
      assignment.effective_to,
      assignment.created_at,
      assignment.updated_at,
      profile.full_name as driver_name,
      profile.email as driver_email,
      exists (
        select 1
        from public.driver_trips trip
        where trip.driver_route_assignment_id = assignment.id
          and trip.tenant_id = assignment.tenant_id
          and trip.status = 'active'
      ) as has_active_trip
    from public.driver_route_assignments assignment
    join public.drivers driver
      on driver.id = assignment.driver_id and driver.tenant_id = assignment.tenant_id
    join public.profiles profile
      on profile.id = driver.profile_id and profile.tenant_id = assignment.tenant_id
    where assignment.bus_id = p_bus_id
      and assignment.tenant_id = v_caller.tenant_id
  ) driver_row;

  select coalesce(jsonb_agg(to_jsonb(student_row) order by student_row.created_at desc), '[]'::jsonb)
  into v_students
  from (
    select
      student_assignment.id,
      student_assignment.tenant_id,
      student_assignment.student_id,
      student_assignment.bus_route_assignment_id,
      student_assignment.route_trip_pattern_id,
      student_assignment.pickup_stop_id,
      student_assignment.dropoff_stop_id,
      student_assignment.effective_from,
      student_assignment.effective_to,
      student_assignment.status,
      student_assignment.created_at,
      student_assignment.updated_at,
      concat_ws(' ', student.first_name, student.last_name) as student_name,
      pickup.stop_name as pickup_stop_name,
      dropoff.stop_name as dropoff_stop_name
    from public.student_bus_assignments student_assignment
    join public.bus_route_assignments bus_assignment
      on bus_assignment.id = student_assignment.bus_route_assignment_id
     and bus_assignment.tenant_id = student_assignment.tenant_id
    join public.students student
      on student.id = student_assignment.student_id
     and student.tenant_id = student_assignment.tenant_id
    left join public.route_stops pickup
      on pickup.id = student_assignment.pickup_stop_id
     and pickup.tenant_id = student_assignment.tenant_id
    left join public.route_stops dropoff
      on dropoff.id = student_assignment.dropoff_stop_id
     and dropoff.tenant_id = student_assignment.tenant_id
    where bus_assignment.bus_id = p_bus_id
      and student_assignment.tenant_id = v_caller.tenant_id
  ) student_row;

  return jsonb_build_object(
    'bus', v_bus,
    'routeAssignments', v_routes,
    'driverAssignments', v_drivers,
    'studentAssignments', v_students
  );
end;
$$;

revoke all on function public.get_admin_bus_workspace(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_bus_workspace(uuid) to authenticated;

-- Preserve the established onboarding implementation as a database-internal
-- routine. The public wrapper validates and stores a new bus's fleet number in
-- the same transaction, so any fleet-number failure rolls back all onboarding.
alter function public.admin_create_student_onboarding(jsonb)
  set schema safebus_private;
alter function safebus_private.admin_create_student_onboarding(jsonb)
  rename to admin_create_student_onboarding_base;

revoke all on function safebus_private.admin_create_student_onboarding_base(jsonb)
  from public, anon, authenticated, service_role;

create function public.admin_create_student_onboarding(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_result jsonb;
  v_new_bus boolean;
  v_bus_id uuid;
  v_bus_number text;
  v_fleet_number text;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role <> 'tenant_admin' then
    raise exception 'Only an active tenant administrator can use student onboarding.'
      using errcode = '42501';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 32768 then
    raise exception 'Invalid student onboarding payload.' using errcode = '22023';
  end if;

  v_new_bus := coalesce(p_payload #>> '{transportation,enabled}', 'false') = 'true'
    and nullif(p_payload #>> '{transportation,bus,id}', '') is null;

  if v_new_bus then
    v_fleet_number := regexp_replace(
      btrim(coalesce(p_payload #>> '{transportation,bus,fleetNumber}', '')),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if v_fleet_number = '' or length(v_fleet_number) > 40 then
      raise exception 'Fleet number is required for a new bus and must be at most 40 characters.'
        using errcode = '22023';
    end if;
  end if;

  v_result := safebus_private.admin_create_student_onboarding_base(p_payload);

  if v_new_bus then
    v_bus_id := (v_result ->> 'busId')::uuid;
    insert into public.bus_admin_details (bus_id, tenant_id, fleet_number)
    values (v_bus_id, v_caller.tenant_id, v_fleet_number);

    select bus_number into v_bus_number
    from public.buses
    where id = v_bus_id and tenant_id = v_caller.tenant_id;

    perform safebus_private.write_audit_event(
      'bus.created', 'bus', v_bus_id, v_bus_number, 'success',
      jsonb_build_object('changed_fields', jsonb_build_array(
        'bus_number', 'fleet_number', 'license_plate', 'capacity', 'school_id', 'status'
      )),
      null
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_create_student_onboarding(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_create_student_onboarding(jsonb) to authenticated;

alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (
  action in (
    'auth.login', 'auth.logout', 'auth.password_reset_requested',
    'auth.password_reset_completed', 'auth.password_changed',
    'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
    'auth.account_recovery', 'auth.recent_auth_required',
    'invitation.created', 'invitation.resent', 'invitation.cancelled',
    'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
    'invitation.revoked', 'invitation.expired',
    'role.changed', 'role.escalation_blocked',
    'guardian.student_link_created', 'guardian.student_link_removed',
    'driver.assignment_created', 'driver.assignment_removed',
    'student.record_accessed', 'data.exported',
    'tenant.suspended', 'tenant.reactivated', 'tenant.lifecycle_changed',
    'account.revoked', 'account.suspended', 'account.restored',
    'security.config_changed', 'rate_limit.exceeded', 'retention.deletion_run',
    'admin.invited', 'admin.activated', 'admin.deactivated',
    'admin.transferred', 'admin.recovered', 'admin.departed', 'admin.role_changed',
    'bulk_import.created', 'bulk_import.validated', 'bulk_import.committed',
    'bulk_import.rolled_back', 'bulk_import.invitations_queued', 'audit.searched',
    'billing.subscription_created', 'billing.subscription_updated',
    'billing.quantity_changed',
    'billing.cancellation_scheduled', 'billing.renewal_resumed',
    'billing.subscription_reconciled', 'billing.portal_opened',
    'school.created', 'school.updated', 'school.archived', 'school.restored',
    'bus.created', 'bus.details_updated'
  )
);

comment on table public.bus_admin_details is
  'Tenant-scoped internal fleet identifiers. Separate from public.buses so driver and guardian bus access never exposes administrative fleet numbers.';
comment on column public.bus_admin_details.fleet_number is
  'Current physical vehicle identifier used by transportation administrators. Not a family-facing service number.';
comment on function public.admin_create_bus(uuid, text, text, text, integer, text) is
  'Atomically creates a tenant-scoped bus and its required internal fleet number. Tenant identity is derived from auth context.';
comment on function public.admin_update_bus(uuid, uuid, text, text, integer, text) is
  'Atomically updates mutable bus details and creates or updates the required internal fleet number. The public bus number is never changed.';
comment on function public.get_admin_buses_page(integer, integer, text, text, uuid) is
  'Returns an administrator-scoped bus page with internal fleet numbers. Drivers, guardians, and platform administrators are rejected.';
comment on function public.admin_create_student_onboarding(jsonb) is
  'Tenant-admin-only transactional student onboarding. New buses require a fleet number stored atomically in the admin-only metadata table.';

do $$
begin
  if to_regclass('public.bus_admin_details') is null
    or to_regprocedure('public.admin_create_bus(uuid,text,text,text,integer,text)') is null
    or to_regprocedure('public.admin_update_bus(uuid,uuid,text,text,integer,text)') is null
    or to_regprocedure('public.get_admin_buses_page(integer,integer,text,text,uuid)') is null
    or to_regprocedure('public.get_admin_bus_workspace(uuid)') is null
    or to_regprocedure('public.search_admin_buses(text,integer)') is null
    or to_regprocedure('public.admin_create_student_onboarding(jsonb)') is null then
    raise exception 'Internal fleet-number administration surface is incomplete.';
  end if;
end
$$;
