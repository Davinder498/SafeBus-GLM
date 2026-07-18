-- SafeBus Alberta - scalable guardian/driver directory and identifier retirement
--
-- Adds structured member names and driver compliance/contact fields used by
-- the server-only invitation workflow. All tables remain protected by their
-- existing tenant-scoped RLS policies.
--
-- school_student_number is retained temporarily as a NULL-only compatibility
-- tombstone so already-applied PL/pgSQL migrations remain callable during a
-- rolling hosted DEV deployment. Current application code cannot read or
-- write it, existing values are erased, and the constraint prevents future
-- storage. A later maintenance migration may physically drop the tombstone
-- after every environment has moved beyond migration 0042.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.guardians
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.drivers
  add column if not exists license_number text,
  add column if not exists license_issue_date date,
  add column if not exists license_expiry_date date,
  add column if not exists license_class text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text;

update public.profiles
set
  first_name = coalesce(
    nullif(btrim(first_name), ''),
    nullif(split_part(btrim(full_name), ' ', 1), ''),
    'Unknown'
  ),
  last_name = coalesce(
    nullif(btrim(last_name), ''),
    nullif(btrim(substring(btrim(full_name) from position(' ' in btrim(full_name)) + 1)), ''),
    nullif(split_part(btrim(full_name), ' ', 1), ''),
    'Unknown'
  )
where first_name is null
   or btrim(first_name) = ''
   or last_name is null
   or btrim(last_name) = '';

update public.guardians g
set
  first_name = coalesce(
    nullif(btrim(g.first_name), ''),
    nullif(btrim(p.first_name), ''),
    nullif(split_part(btrim(g.full_name), ' ', 1), ''),
    'Unknown'
  ),
  last_name = coalesce(
    nullif(btrim(g.last_name), ''),
    nullif(btrim(p.last_name), ''),
    nullif(btrim(substring(btrim(g.full_name) from position(' ' in btrim(g.full_name)) + 1)), ''),
    nullif(split_part(btrim(g.full_name), ' ', 1), ''),
    'Unknown'
  )
from public.profiles p
where p.id = g.profile_id
  and (
    g.first_name is null
    or btrim(g.first_name) = ''
    or g.last_name is null
    or btrim(g.last_name) = ''
  );

create or replace function public.normalize_member_structured_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_full_name text := btrim(coalesce(new.full_name, ''));
begin
  if tg_op = 'UPDATE'
     and new.full_name is distinct from old.full_name
     and new.first_name is not distinct from old.first_name
     and new.last_name is not distinct from old.last_name then
    new.first_name := null;
    new.last_name := null;
  end if;
  new.first_name := coalesce(
    nullif(btrim(new.first_name), ''),
    nullif(split_part(v_full_name, ' ', 1), ''),
    'Unknown'
  );
  new.last_name := coalesce(
    nullif(btrim(new.last_name), ''),
    nullif(btrim(substring(v_full_name from position(' ' in v_full_name) + 1)), ''),
    new.first_name
  );
  new.full_name := concat_ws(' ', new.first_name, new.last_name);
  return new;
end;
$$;

drop trigger if exists normalize_structured_name_profiles on public.profiles;
create trigger normalize_structured_name_profiles
  before insert or update of first_name, last_name, full_name
  on public.profiles
  for each row execute function public.normalize_member_structured_name();

drop trigger if exists normalize_structured_name_guardians on public.guardians;
create trigger normalize_structured_name_guardians
  before insert or update of first_name, last_name, full_name
  on public.guardians
  for each row execute function public.normalize_member_structured_name();

alter table public.profiles
  drop constraint if exists profiles_structured_names_length_check;
alter table public.profiles
  add constraint profiles_structured_names_length_check check (
    length(first_name) between 1 and 100
    and length(last_name) between 1 and 100
  ) not valid;

alter table public.profiles
  alter column first_name set not null,
  alter column last_name set not null;

alter table public.guardians
  drop constraint if exists guardians_structured_names_length_check;
alter table public.guardians
  add constraint guardians_structured_names_length_check check (
    length(first_name) between 1 and 100
    and length(last_name) between 1 and 100
  ) not valid;

alter table public.guardians
  alter column first_name set not null,
  alter column last_name set not null;

alter table public.drivers
  drop constraint if exists drivers_license_dates_check,
  drop constraint if exists drivers_license_class_check,
  drop constraint if exists drivers_license_details_complete_check,
  drop constraint if exists drivers_address_complete_check,
  drop constraint if exists drivers_directory_fields_length_check;
alter table public.drivers
  add constraint drivers_license_dates_check check (
    license_expiry_date is null
    or license_issue_date is null
    or license_expiry_date >= license_issue_date
  ),
  add constraint drivers_license_class_check check (
    license_class is null or license_class in ('1', '2', '3', '4', '5', '6', '7')
  ),
  add constraint drivers_license_details_complete_check check (
    (
      license_number is null
      and license_issue_date is null
      and license_expiry_date is null
      and license_class is null
    )
    or (
      license_number is not null
      and license_issue_date is not null
      and license_expiry_date is not null
      and license_class is not null
    )
  ),
  add constraint drivers_address_complete_check check (
    (
      address_line1 is null
      and city is null
      and province is null
      and postal_code is null
    )
    or (
      address_line1 is not null
      and city is not null
      and province is not null
      and postal_code is not null
    )
  ),
  add constraint drivers_directory_fields_length_check check (
    (license_number is null or length(license_number) between 1 and 64)
    and (address_line1 is null or length(address_line1) between 1 and 160)
    and (address_line2 is null or length(address_line2) between 1 and 160)
    and (city is null or length(city) between 1 and 100)
    and (province is null or province ~ '^[A-Z]{2}$')
    and (postal_code is null or postal_code ~ '^[A-Z][0-9][A-Z] [0-9][A-Z][0-9]$')
    and (phone is null or length(phone) between 1 and 40)
  );

create index if not exists profiles_tenant_last_first_page_idx
  on public.profiles (tenant_id, last_name, first_name, id);

create index if not exists guardians_tenant_last_first_page_idx
  on public.guardians (tenant_id, last_name, first_name, id);

create index if not exists drivers_tenant_expiry_page_idx
  on public.drivers (tenant_id, license_expiry_date, id);

create unique index if not exists drivers_tenant_license_number_unique_idx
  on public.drivers (tenant_id, lower(license_number))
  where license_number is not null;

drop index if exists public.guardians_tenant_active_name_prefix_idx;
create index if not exists guardians_tenant_active_last_name_prefix_idx
  on public.guardians (tenant_id, (lower(last_name)) text_pattern_ops, id)
  where status = 'active';
create index if not exists guardians_tenant_active_first_name_prefix_idx
  on public.guardians (tenant_id, (lower(first_name)) text_pattern_ops, id)
  where status = 'active';

create or replace function public.search_admin_guardians(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  profile_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    g.id,
    concat_ws(' ', g.first_name, g.last_name),
    g.email,
    g.phone,
    p.status::text
  from public.guardians g
  join public.profiles p
    on p.id = g.profile_id
   and p.tenant_id = g.tenant_id
   and p.role = 'guardian'
  where public.current_user_role() = 'tenant_admin'
    and g.tenant_id = public.current_tenant_id()
    and g.status = 'active'
    and (
      lower(g.first_name) like lower(trim(p_search)) || '%'
      or lower(g.last_name) like lower(trim(p_search)) || '%'
      or lower(g.email) like lower(trim(p_search)) || '%'
    )
  order by g.last_name, g.first_name, g.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_admin_guardians(text, integer) from public, anon;
grant execute on function public.search_admin_guardians(text, integer) to authenticated;

create or replace function public.search_admin_students(
  p_search text,
  p_limit integer default 20
)
returns table(id uuid, label text, school_name text)
language sql
security invoker
set search_path = public
as $$
  select s.id, concat_ws(' ', s.first_name, s.last_name), sc.name
  from public.students s
  left join public.schools sc on sc.id = s.school_id
  where public.is_transportation_write_admin()
    and s.tenant_id = public.current_tenant_id()
    and s.status = 'active'
    and lower(concat_ws(' ', s.first_name, s.last_name, s.preferred_name))
      like '%' || lower(trim(coalesce(p_search, ''))) || '%'
  order by s.last_name, s.first_name, s.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.get_admin_students_page(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_status text default null,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := public.admin_page_size(p_page_size);
  v_search text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  v_result jsonb;
begin
  if not public.is_transportation_write_admin() or v_tenant is null then
    raise exception 'Admin tenant context is required' using errcode = '42501';
  end if;

  with filtered as (
    select
      s.id,
      s.tenant_id,
      s.school_id,
      s.first_name,
      s.last_name,
      s.preferred_name,
      s.grade,
      s.status,
      s.created_at,
      s.updated_at,
      sc.name school_name,
      ba.id bus_assignment_id,
      ba.bus_route_assignment_id,
      ba.pickup_stop_id,
      ba.dropoff_stop_id,
      ba.effective_from bus_effective_from,
      ba.effective_to bus_effective_to,
      bra.bus_id,
      bra.route_id,
      bra.trip_type,
      b.bus_number,
      r.route_name,
      r.route_code,
      ps.stop_name pickup_stop_name,
      ds.stop_name dropoff_stop_name
    from public.students s
    left join public.schools sc on sc.id = s.school_id
    left join lateral (
      select sba.*
      from public.student_bus_assignments sba
      where sba.student_id = s.id
        and sba.tenant_id = s.tenant_id
        and sba.status = 'active'
        and sba.effective_from <= current_date
        and (sba.effective_to is null or sba.effective_to >= current_date)
      order by sba.effective_from desc, sba.created_at desc
      limit 1
    ) ba on true
    left join public.bus_route_assignments bra on bra.id = ba.bus_route_assignment_id
    left join public.buses b on b.id = bra.bus_id
    left join public.routes r on r.id = bra.route_id
    left join public.route_stops ps on ps.id = ba.pickup_stop_id
    left join public.route_stops ds on ds.id = ba.dropoff_stop_id
    where s.tenant_id = v_tenant
      and (p_status is null or s.status = p_status)
      and (p_school_id is null or s.school_id = p_school_id)
      and (
        trim(coalesce(p_search, '')) = ''
        or lower(concat_ws(
          ' ',
          s.first_name,
          s.last_name,
          s.preferred_name,
          s.grade,
          sc.name,
          b.bus_number,
          r.route_name
        )) like v_search
      )
  ),
  page_rows as (
    select *
    from filtered
    order by last_name, first_name, id
    limit v_size
    offset ((v_page - 1) * v_size)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size
  )
  into v_result
  from page_rows;

  return v_result;
end;
$$;

revoke all on function public.search_admin_students(text, integer) from public, anon;
revoke all on function public.get_admin_students_page(integer, integer, text, text, uuid) from public, anon;
grant execute on function public.search_admin_students(text, integer) to authenticated;
grant execute on function public.get_admin_students_page(integer, integer, text, text, uuid) to authenticated;

-- Remove the student-specific school number from product functionality while
-- preserving rolling-deployment compatibility with the already-applied 0042
-- function body.
update public.students
set school_student_number = null
where school_student_number is not null;

alter table public.students
  drop constraint if exists students_school_student_number_retired_check;
alter table public.students
  add constraint students_school_student_number_retired_check
  check (school_student_number is null);

comment on column public.students.school_student_number is
  'Retired compatibility tombstone. Must remain NULL and is not exposed by current application code.';
comment on column public.drivers.license_number is
  'Tenant-scoped driver licence identifier. Never exposed on roster pages or guardian-facing views.';

revoke all on function public.normalize_member_structured_name()
  from public, anon, authenticated;
