CREATE OR REPLACE FUNCTION public.get_guardian_bus_visibility_v2()
 RETURNS TABLE(student_id uuid, student_name text, student_grade text, assignment_state text, bus_number text, license_plate text, has_active_trip boolean, location_state text, latitude double precision, longitude double precision, location_recorded_at timestamp with time zone, location_age_seconds bigint, eta_status text, eta_label text, student_trip_status text, pickup_event_time timestamp with time zone, dropoff_event_time timestamp with time zone, last_event_time timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
  select visibility.*
  from safebus_private.get_guardian_bus_visibility() visibility
  join public.student_guardians sg
    on sg.student_id = visibility.student_id
   and sg.tenant_id = safebus_private.current_tenant_id()
   and sg.guardian_id = safebus_private.current_guardian_id()
   and sg.status = 'active'
   and (sg.access_expires_at is null or sg.access_expires_at > now())
  where auth.uid() is not null
    and safebus_private.current_user_role() is not distinct from 'guardian'::public.user_role;
$function$
