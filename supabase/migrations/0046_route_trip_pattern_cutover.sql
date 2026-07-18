-- SafeBus Alberta - guarded route/trip pattern compatibility cleanup
--
-- Apply to hosted DEV only after every active route reports definition_status
-- = ready and all active/future assignments have a route_trip_pattern_id.
-- This migration deliberately aborts rather than silently disabling service.

do $$
begin
  if exists (
    select 1 from public.routes
    where status = 'active' and definition_status <> 'ready'
  ) then
    raise exception 'Cutover blocked: active routes still need complete coordinate definitions.';
  end if;
  if exists (
    select 1 from public.driver_route_assignments
    where status = 'active' and route_trip_pattern_id is null
  ) or exists (
    select 1 from public.bus_route_assignments
    where status = 'active' and route_trip_pattern_id is null
  ) or exists (
    select 1 from public.driver_trips
    where status = 'active' and route_trip_pattern_id is null
  ) or exists (
    select 1 from public.student_bus_assignments
    where status = 'active' and route_trip_pattern_id is null
  ) then
    raise exception 'Cutover blocked: active assignments or trips still use legacy trip types.';
  end if;
  if exists (
    select 1 from public.route_trip_patterns
    where status = 'active' and schedule_review_required
  ) then
    raise exception 'Cutover blocked: backfilled trip schedules still require review.';
  end if;
end;
$$;

alter table public.driver_route_assignments
  alter column route_trip_pattern_id set not null;
alter table public.bus_route_assignments
  alter column route_trip_pattern_id set not null;
alter table public.driver_trips
  alter column route_trip_pattern_id set not null,
  alter column trip_name_snapshot set not null;
alter table public.student_bus_assignments
  alter column route_trip_pattern_id set not null;

-- Legacy columns remain for one hosted-DEV release as derived compatibility
-- values. Application code must no longer use them for direction decisions.
comment on column public.routes.route_type is
  'Deprecated compatibility value. Use route_kind and route_trip_patterns.';
comment on column public.driver_route_assignments.trip_type is
  'Deprecated compatibility value derived from route_trip_patterns.direction.';
comment on column public.bus_route_assignments.trip_type is
  'Deprecated compatibility value derived from route_trip_patterns.direction.';
comment on column public.driver_trips.trip_type is
  'Deprecated compatibility snapshot. Use route_trip_pattern_id and trip_name_snapshot.';
comment on column public.student_bus_assignments.trip_type is
  'Deprecated compatibility value derived from route_trip_patterns.direction.';

create or replace function public.enforce_ready_route_trip_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.route_definition_is_ready(new.route_id)
    or exists (
      select 1 from public.route_trip_patterns
      where id = new.route_trip_pattern_id
        and (status <> 'active' or schedule_review_required)
    ) then
    raise exception 'The selected route and trip must be ready before service starts.'
      using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger enforce_ready_route_trip_start
  before insert on public.driver_trips
  for each row execute function public.enforce_ready_route_trip_start();

revoke all on function public.enforce_ready_route_trip_start() from public, anon;
