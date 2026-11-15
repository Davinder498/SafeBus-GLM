begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
do $$
begin
  if safebus_private.can_receive_bus_tracking(null) is distinct from false then
    raise exception 'Invalid shared topic must be denied';
  end if;
  if has_function_privilege('anon','safebus_private.can_receive_bus_tracking(text)','EXECUTE')
    or has_function_privilege('service_role','safebus_private.can_receive_bus_tracking(text)','EXECUTE')
    or not has_function_privilege('authenticated','safebus_private.can_receive_bus_tracking(text)','EXECUTE') then
    raise exception 'Shared tracking execution privileges changed';
  end if;
  if not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages'
    and policyname='safebus shared bus tracking receive' and cmd='SELECT'
    and roles::text[]=array['authenticated']::text[] and with_check is null) then
    raise exception 'Shared tracking receive-only policy missing';
  end if;
  if (select count(*) from pg_policies where schemaname='realtime' and tablename='messages'
    and policyname in ('safebus_active_session','safebus_optional_mfa') and permissive='RESTRICTIVE') <> 2 then
    raise exception 'Tracking session or MFA guard missing';
  end if;
end;
$$;
rollback;
