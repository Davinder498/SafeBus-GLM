-- Structural security regression for migration 0028.
-- Execute only against hosted Supabase DEV or a disposable migrated database.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.can_write_student_route_assignment(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('can_write_optional_school(s.tenant_id, s.school_id)' in v_definition) = 0 then
    raise exception '0028 regression: student school authorization is not optional-school aware';
  end if;
  if position('can_write_optional_school(r.tenant_id, r.school_id)' in v_definition) = 0 then
    raise exception '0028 regression: route school authorization is not optional-school aware';
  end if;
  if position('s.tenant_id = p_tenant_id' in v_definition) = 0
     or position('r.tenant_id = p_tenant_id' in v_definition) = 0 then
    raise exception '0028 regression: tenant isolation checks are missing';
  end if;
  if position('ps.route_id = p_route_id' in v_definition) = 0
     or position('ds.route_id = p_route_id' in v_definition) = 0 then
    raise exception '0028 regression: stop-to-route validation is missing';
  end if;
  if position('ps.status = ''active''' in v_definition) = 0
     or position('ds.status = ''active''' in v_definition) = 0 then
    raise exception '0028 regression: active-stop validation is missing';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_route_assignments'
      and policyname = 'student route assignments insert admin'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception '0028 regression: authenticated insert policy is missing';
  end if;
end
$$;
