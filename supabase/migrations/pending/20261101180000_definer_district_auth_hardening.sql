-- Prepared/unapplied SafeBus security correction from observed live definitions.
-- Intended for controlled adoption only; no production SQL executed here.
-- Restrict bus mutation and announcement helper to district administrators.
-- Preserve input and output types, MFA, tenant checks, audit, and UX contracts.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regprocedure('safebus_private.current_user_role()') is null
    or to_regprocedure('safebus_private.require_announcement_admin()') is null
    or to_regprocedure('public.admin_create_bus(uuid,text,text,text,integer,text)') is null
    or to_regprocedure('public.admin_update_bus(uuid,uuid,text,text,integer,text)') is null
    or not exists (
      select 1 from pg_proc p
      where p.oid = 'safebus_private.current_user_role()'::regprocedure
        and pg_get_functiondef(p.oid) like '%p.role::text <> ''school_admin''%'
    ) then raise exception 'District-only authorization baseline required';
  end if;
end;
$preflight$;

-- Audited live definition: public.admin_create_bus
CREATE OR REPLACE FUNCTION public.admin_create_bus(p_school_id uuid, p_bus_number text, p_fleet_number text, p_license_plate text, p_capacity integer, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
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
    or safebus_private.current_user_role() not in ('tenant_admin', 'transportation_admin') then
    raise exception 'An active tenant bus administrator is required.' using errcode = '42501';
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
$function$

-- Audited live definition: public.admin_update_bus
CREATE OR REPLACE FUNCTION public.admin_update_bus(p_bus_id uuid, p_school_id uuid, p_fleet_number text, p_license_plate text, p_capacity integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
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
    or safebus_private.current_user_role() not in ('tenant_admin', 'transportation_admin') then
    raise exception 'An active tenant bus administrator is required.' using errcode = '42501';
  end if;

  select * into v_bus
  from public.buses
  where id = p_bus_id and tenant_id = v_caller.tenant_id
  for update;

  if v_bus.id is null then
    raise exception 'Bus not found.' using errcode = 'P0002';
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
$function$

-- Audited live definition: safebus_private.require_announcement_admin
CREATE OR REPLACE FUNCTION safebus_private.require_announcement_admin()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_profile public.profiles;
begin
  if auth.uid() is null or not public.is_current_user_session_active() then
    raise exception 'Active sign-in required.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  select p.* into v_profile from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.id = auth.uid() and p.status = 'active'
    and p.role in ('tenant_admin', 'transportation_admin');
  if not found then
    raise exception 'Active school authority administrator access required.' using errcode = '42501';
  end if;
  return v_profile;
end;
$function$
