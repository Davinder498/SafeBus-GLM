-- Pending: install through the protected offline_actions operational release.
-- Hold the own-trip row lock across revision comparison and the existing action.
do $guard$ begin
  if to_regprocedure('public.apply_driver_trip_stop_action(uuid,text,timestamp with time zone,text)') is not null then
    raise exception 'Queued trip action endpoint already exists; reconcile before installation.';
  end if;
end $guard$;
create function public.apply_driver_trip_stop_action(
  p_trip_id uuid, p_action text, p_expected_updated_at timestamptz, p_reason text default null
) returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  v_trip public.driver_trips;
  v_tenant uuid := safebus_private.current_tenant_id();
begin
  if auth.uid() is null or safebus_private.current_user_role()::text is distinct from 'driver'
    or v_tenant is null or not coalesce(public.is_current_user_session_active(), false)
    or not coalesce(safebus_private.has_completed_optional_mfa(), false) then
    raise exception 'An active driver sign-in is required.' using errcode = '42501';
  end if;
  if p_trip_id is null or p_action is null or p_action not in ('pause','end','cancel')
    or p_expected_updated_at is null or not isfinite(p_expected_updated_at)
    or char_length(coalesce(p_reason,'')) > 120 then
    raise exception 'A valid saved trip action is required.' using errcode = '22023';
  end if;
  select dt.* into v_trip from public.driver_trips dt
  join public.drivers d on d.id=dt.driver_id and d.tenant_id=dt.tenant_id and d.status='active'
  join public.profiles p on p.id=d.profile_id and p.id=auth.uid() and p.tenant_id=dt.tenant_id
    and p.role::text='driver' and p.status='active'
  join public.tenants t on t.id=dt.tenant_id and t.status='active'
  where dt.id=p_trip_id and dt.tenant_id=v_tenant
    and dt.driver_id=safebus_private.current_driver_id()
  for update of dt;
  if not found then raise exception 'Trip is not available.' using errcode='42501'; end if;
  if v_trip.status in ('completed','cancelled') then return 'obsolete'; end if;
  if p_action='pause' and v_trip.status='paused' then return 'confirmed'; end if;
  if v_trip.updated_at is distinct from p_expected_updated_at then return 'review'; end if;
  -- These existing endpoints retain their own ownership, state, operational
  -- text, tracking-session, dispatch, audit and notification behavior.
  if p_action='pause' then perform public.pause_driver_trip(p_trip_id);
  elsif p_action='end' then perform public.end_driver_trip(p_trip_id);
  else perform public.cancel_driver_trip(p_trip_id,p_reason); end if;
  return 'applied';
end;
$function$;
revoke all on function public.apply_driver_trip_stop_action(uuid,text,timestamptz,text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_driver_trip_stop_action(uuid,text,timestamptz,text) to authenticated;
