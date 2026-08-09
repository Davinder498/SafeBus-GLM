-- Structural security regression for migration 0030.

do $$
declare
  v_policy text;
  v_function text;
  v_trigger_count integer;
  v_table_acl text;
  v_effective_roles text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid)
    into v_policy
  from pg_policy pol
  where pol.polrelid = 'realtime.messages'::regclass
    and pol.polname = 'safebus tracking broadcast receive';

  if v_policy is null
     or position('safebus:guardian:' in v_policy) = 0
     or position('safebus:tenant:' in v_policy) = 0
     or position('auth.uid()' in v_policy) = 0
     or position('current_tenant_id()' in v_policy) = 0
     or position('extension' in v_policy) = 0 then
    raise exception '0030 regression: private tracking topic policy is incomplete';
  end if;

  if has_table_privilege('authenticated', 'realtime.messages', 'INSERT') then
    select coalesce(c.relacl::text, '<default>')
      into v_table_acl
    from pg_class c
    where c.oid = 'realtime.messages'::regclass;

    select coalesce(string_agg(r.rolname, ',' order by r.rolname), '<none>')
      into v_effective_roles
    from pg_roles r
    where r.rolname <> 'authenticated'
      and pg_has_role('authenticated', r.oid, 'USAGE');

    raise exception
      '0030 regression: browser clients can publish realtime messages; table_acl=%; effective_roles=%',
      v_table_acl,
      v_effective_roles;
  end if;

  select pg_get_functiondef(
    'public.send_tracking_invalidation(text,text)'::regprocedure
  ) into v_function;

  if position('latitude' in lower(v_function)) > 0
     or position('longitude' in lower(v_function)) > 0
     or position('student_id' in lower(v_function)) > 0
     or position('driver_trip_id' in lower(v_function)) > 0 then
    raise exception '0030 regression: invalidation payload exposes tracking identifiers or coordinates';
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'notify_tracking_location_change',
      'notify_tracking_trip_change',
      'notify_tracking_student_route_assignment_change',
      'notify_tracking_student_guardian_change',
      'notify_tracking_guardian_change',
      'notify_tracking_student_change',
      'notify_tracking_route_change',
      'notify_tracking_bus_change',
      'notify_tracking_driver_change',
      'notify_tracking_profile_change'
    );

  if v_trigger_count <> 10 then
    raise exception '0030 regression: expected 10 tracking invalidation triggers, found %', v_trigger_count;
  end if;

  if has_table_privilege('authenticated', 'public.driver_trip_current_locations', 'SELECT') then
    -- Existing admin/driver RLS may pair with SELECT grants. Guardians must
    -- still be denied by policy; the full guardian RLS suite verifies that
    -- behavior with role-specific JWT claims.
    null;
  end if;
end
$$;
