-- Reviewed, bounded verification for use only AFTER approved migration 0120.
-- No fixtures, preference getters (which initialize defaults), mutation RPCs,
-- deliveries, or persistent role/claim changes are executed.
begin transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';

do $$
declare
  v_profile record;
  v_foreign_id uuid;
  v_count integer;
  v_definition text;
  v_name text;
begin
  foreach v_name in array array[
    'public.get_guardian_delivery_preferences_v3()',
    'public.set_guardian_delivery_preferences_v3(jsonb)',
    'public.get_user_notification_detail(uuid)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute')
      or not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'Notification RPC grants are incorrect';
    end if;
  end loop;
  if not exists (select 1 from pg_trigger
    where tgrelid = 'public.user_notifications'::regclass
      and tgname = 'enforce_driver_assignment_only_notification' and not tgisinternal and tgenabled <> 'D') then
    raise exception 'Driver assignment-only insertion guard is missing';
  end if;
  foreach v_name in array array[
    'public.mark_user_notifications_read(uuid[],boolean)',
    'public.mark_all_user_notifications_read()',
    'public.archive_user_notifications(uuid[])'
  ] loop
    v_definition := pg_get_functiondef(v_name::regprocedure);
    if v_definition not like '%notification_recipient_can_access(n)%'
      or v_definition not like '%recipient_profile_id = ( SELECT auth.uid()%'
         and v_definition not like '%recipient_profile_id = (select auth.uid())%' then
      raise exception 'Notification action is missing current recipient authorization';
    end if;
  end loop;

  -- At most two existing recipients per supported tenant role; no identifying
  -- data is emitted. Each check uses only the authenticated role and its claims.
  for v_profile in
    select sample.id, sample.tenant_id, sample.school_id, sample.role
    from (values ('guardian'), ('driver'), ('tenant_admin'), ('transportation_admin'), ('school_admin')) wanted(role)
    cross join lateral (
      select p.id, p.tenant_id, p.school_id, p.role
      from public.profiles p where p.status = 'active' and p.role::text = wanted.role
      order by p.id limit 2
    ) sample
  loop
    select n.id into v_foreign_id from public.user_notifications n
    where n.recipient_profile_id <> v_profile.id order by n.created_at desc limit 1;
    perform set_config('request.jwt.claim.sub', v_profile.id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profile.id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    if exists (
      select 1 from public.user_notifications n
      where n.recipient_profile_id <> v_profile.id or n.tenant_id is distinct from v_profile.tenant_id
        or not n.in_app_visible
        or (v_profile.role = 'driver' and (n.category <> 'assignments' or n.event_type not in (
          'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended')))
        or (v_profile.role = 'school_admin' and n.school_id is distinct from v_profile.school_id)
    ) then raise exception 'Notification RLS exposes an unauthorized row'; end if;

    select count(*)::integer into v_count from public.user_notifications n
    where n.read_at is null and n.archived_at is null;
    if v_count <> public.get_user_notification_unread_count() then
      raise exception 'Unread count disagrees with the authorized visible inbox';
    end if;
    if exists (select 1 from public.get_user_notifications(30) inbox
      where not exists (select 1 from public.user_notifications n where n.id = inbox.id)) then
      raise exception 'Inbox RPC exposes a row denied by RLS';
    end if;
    if v_foreign_id is not null and exists (
      select 1 from public.get_user_notification_detail(v_foreign_id)
    ) then raise exception 'Notification detail exposes another recipient'; end if;

    perform set_config('role', 'none', true);
  end loop;
end;
$$;

rollback;
