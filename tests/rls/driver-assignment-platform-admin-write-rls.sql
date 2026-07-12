-- Structural security regression for migration 0029.

do $$
declare
  v_insert_check text;
  v_update_using text;
  v_update_check text;
begin
  select pg_get_expr(pol.polwithcheck, pol.polrelid)
    into v_insert_check
  from pg_policy pol
  where pol.polrelid = 'public.driver_route_assignments'::regclass
    and pol.polname = 'driver_route_assignments insert admin';

  if v_insert_check is null
     or position('can_write_tenant(tenant_id)' in v_insert_check) = 0
     or position('driver_assignment_entities_in_tenant' in v_insert_check) = 0 then
    raise exception '0029 regression: assignment insert policy is not tenant- and entity-scoped';
  end if;

  select
    pg_get_expr(pol.polqual, pol.polrelid),
    pg_get_expr(pol.polwithcheck, pol.polrelid)
    into v_update_using, v_update_check
  from pg_policy pol
  where pol.polrelid = 'public.driver_route_assignments'::regclass
    and pol.polname = 'driver_route_assignments update admin';

  if v_update_using is null
     or position('can_write_tenant(tenant_id)' in v_update_using) = 0 then
    raise exception '0029 regression: assignment update USING policy is not tenant-scoped';
  end if;

  if v_update_check is null
     or position('can_write_tenant(tenant_id)' in v_update_check) = 0
     or position('driver_assignment_entities_in_tenant' in v_update_check) = 0 then
    raise exception '0029 regression: assignment update check is not tenant- and entity-scoped';
  end if;
end
$$;
