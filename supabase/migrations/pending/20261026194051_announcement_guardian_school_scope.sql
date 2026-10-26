-- Forward change only; hold pending until protected review/release.
-- Authority-wide announcements accept active guardian/student links without a
-- school assignment. School-admin scope still requires an active matching school.
do $reconcile$
begin
  if md5(replace(pg_get_functiondef(to_regprocedure('safebus_private.announcement_recipients(uuid,uuid,text,uuid)')), chr(13), ''))
      is distinct from '70d7a9d09f179581918c789c3692deb9' then
    raise exception 'Announcement audience baseline differs' using errcode = '55000';
  end if;
end;
$reconcile$;

CREATE OR REPLACE FUNCTION safebus_private.announcement_recipients(p_tenant_id uuid, p_school_id uuid, p_audience text, p_recipient_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, role user_role)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.role from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.tenant_id = p_tenant_id and p.status = 'active' and (p_recipient_id is null or p.id = p_recipient_id) and (
    (p_audience in ('all', 'guardians') and p.role = 'guardian' and exists (
      select 1 from public.guardians g
      join public.student_guardians sg on sg.guardian_id = g.id and sg.tenant_id = g.tenant_id
        and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
      join public.students s on s.id = sg.student_id and s.tenant_id = sg.tenant_id and s.status = 'active'
      where g.profile_id = p.id and g.tenant_id = p_tenant_id and g.status = 'active'
        and (p_school_id is null or (s.school_id = p_school_id and exists (
          select 1 from public.schools school where school.id = s.school_id
            and school.tenant_id = s.tenant_id and school.status = 'active'
        )))
    )) or (p_audience in ('all', 'drivers') and p.role = 'driver' and exists (
      select 1 from public.drivers d where d.profile_id = p.id and d.tenant_id = p_tenant_id and d.status = 'active'
        and (p_school_id is null or exists (
          select 1 from public.driver_route_assignments a
          join public.routes r on r.id = a.route_id and r.tenant_id = a.tenant_id and r.status = 'active'
          join public.schools school on school.id = r.school_id and school.tenant_id = r.tenant_id and school.status = 'active'
          where a.driver_id = d.id and a.tenant_id = d.tenant_id and a.status = 'active'
            and (a.effective_from is null or a.effective_from <= (now() at time zone 'America/Edmonton')::date)
            and (a.effective_to is null or a.effective_to >= (now() at time zone 'America/Edmonton')::date)
            and r.school_id = p_school_id
        ))
    ))
  );
$function$;
