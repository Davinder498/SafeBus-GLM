-- Execute against an approved isolated DEV database after applying the pending
-- school-scope migration. Never execute against the hosted production project.
-- Structural protection only; acceptance also requires role-authenticated
-- two-school / two-tenant fixture tests proving returned rows, not just SQL text.
do $$
declare
  v_definition text;
  v_definer boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef
  into v_definition, v_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_live_route_overlays'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_definition is null then
    raise exception 'Missing admin route overlays RPC';
  end if;
  if not v_definer then
    raise exception 'Admin route overlay function execution contract changed';
  end if;
  if position('r.school_id = safebus_private.current_school_id()' in v_definition) = 0
    or position('safebus_private.current_user_role() <> ''school_admin''' in v_definition) = 0
    or position('safebus_private.current_school_id() is not null' in v_definition) = 0
  then
    raise exception 'School administrators are not explicitly school scoped';
  end if;
  if position('dt.tenant_id = safebus_private.current_tenant_id()' in v_definition) = 0
    or position('r.tenant_id = safebus_private.current_tenant_id()' in v_definition) = 0
    or position('auth.uid() is not null' in v_definition) = 0
  then
    raise exception 'Tenant and caller authorization lost';
  end if;
  if has_function_privilege('anon', 'public.get_admin_live_route_overlays()', 'EXECUTE')
    or has_function_privilege('public', 'public.get_admin_live_route_overlays()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_admin_live_route_overlays()', 'EXECUTE')
  then
    raise exception 'Route overlay execute privileges are not least-privilege';
  end if;

  raise notice 'PASS: admin route overlays school-scope structural guard and grants';
end;
$$;
