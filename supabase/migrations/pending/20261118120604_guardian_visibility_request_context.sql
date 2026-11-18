-- Evaluate request-invariant authorization helpers once per statement, rather
-- than once for each candidate link. No permissions or response fields change.
-- The exact observed definition is required; never patch an unknown function.
do $migration$
declare
  definition text;
  helper text;
begin
  select pg_get_functiondef('public.get_guardian_bus_visibility_v2()'::regprocedure)
    into definition;
  if md5(definition) <> 'aae58b9d0f86b17189f5cdfd9361bbd5' then
    raise exception 'GUARDIAN_VISIBILITY_BASELINE_MISMATCH';
  end if;
  foreach helper in array array[
    'safebus_private.current_tenant_id()',
    'safebus_private.current_guardian_id()',
    'safebus_private.current_user_role()',
    'auth.uid()'
  ] loop
    definition := replace(definition, helper, '(select ' || helper || ')');
  end loop;
  execute definition;
end;
$migration$;
