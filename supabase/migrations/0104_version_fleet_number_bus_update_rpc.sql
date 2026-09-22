-- SafeBus Alberta - version the fleet-number bus update RPC (0104)
--
-- Use a distinct PostgREST endpoint for the fleet-number contract. This avoids
-- resolving the request against an older cached admin_update_bus signature on
-- an existing hosted project while preserving the atomic implementation from
-- migration 0102.

create function public.admin_update_bus_with_fleet_number(
  p_bus_id uuid,
  p_school_id uuid,
  p_fleet_number text,
  p_license_plate text,
  p_capacity integer,
  p_status text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  select public.admin_update_bus(
    p_bus_id,
    p_school_id,
    p_fleet_number,
    p_license_plate,
    p_capacity,
    p_status
  );
$$;

revoke all on function public.admin_update_bus_with_fleet_number(
  uuid, uuid, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_bus_with_fleet_number(
  uuid, uuid, text, text, integer, text
) to authenticated;

comment on function public.admin_update_bus_with_fleet_number(
  uuid, uuid, text, text, integer, text
) is
  'Versioned PostgREST endpoint for the atomic tenant-scoped bus and internal fleet-number update.';

select pg_notify('pgrst', 'reload schema');
