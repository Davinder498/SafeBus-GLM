-- SafeBus Alberta - Phase 5 administrator restoration and bulk invitation queue

create or replace function public.tenant_restore_administrator(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_target public.profiles;
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can restore administrator accounts.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null or v_target.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Administrator not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_target.role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'Only administrator accounts can be restored here.' using errcode = '22023';
  end if;
  if v_target.status = 'active' then
    return jsonb_build_object('profileId', p_profile_id, 'status', 'active', 'changed', false);
  end if;
  if v_target.status = 'invited' then
    raise exception 'This account has a pending invitation. Resend it instead.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tenants where id = v_target.tenant_id and status = 'active'
  ) then
    raise exception 'Reactivate the tenant before restoring its administrator.' using errcode = '22023';
  end if;

  update public.profiles set status = 'active' where id = p_profile_id;
  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.activated', 'profile', p_profile_id, null,
    jsonb_build_object(
      'previous_status', v_target.status::text,
      'role', v_target.role::text,
      'tenant_id', v_target.tenant_id
    )
  );
  return jsonb_build_object('profileId', p_profile_id, 'status', 'active', 'changed', true);
end;
$$;
revoke all on function public.tenant_restore_administrator(uuid)
  from public, anon, authenticated;
grant execute on function public.tenant_restore_administrator(uuid) to authenticated;

create or replace function public.bulk_import_generate_invitations(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_batch public.bulk_import_batches;
  v_queued integer := 0;
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can queue bulk invitations.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_batch from public.bulk_import_batches where id = p_batch_id for update;
  if v_batch.id is null or v_batch.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Import batch not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_batch.status <> 'committed' then
    raise exception 'Invitations can only be queued for committed batches.' using errcode = '22023';
  end if;
  if v_batch.record_type = 'student' then
    return jsonb_build_object(
      'batchId', p_batch_id, 'invitationsQueued', 0,
      'message', 'Students do not receive account invitations.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_batch.tenant_id::text, 2));

  insert into public.tenant_onboarding_invitations (
    tenant_id, email, full_name, role, status, delivery_status,
    bulk_batch_id, source_row_number, expires_at
  )
  select
    v_batch.tenant_id,
    lower(trim(s.row_data ->> 'email')),
    concat_ws(' ', trim(s.row_data ->> 'first_name'), trim(s.row_data ->> 'last_name')),
    case when v_batch.record_type = 'guardian'
      then 'guardian'::public.user_role else 'driver'::public.user_role end,
    'queued', 'pending', p_batch_id, s.row_number,
    now() + interval '30 days'
  from public.bulk_import_staging s
  where s.batch_id = p_batch_id and s.validation_status = 'valid'
  order by s.row_number
  on conflict (bulk_batch_id, source_row_number)
    where bulk_batch_id is not null
  do nothing;
  get diagnostics v_queued = row_count;

  update public.bulk_import_staging s
  set invitation_status = case
        when i.status = 'revoked' then 'revoked'
        when i.delivery_status in ('sent', 'delivered', 'opened') then 'sent'
        when i.delivery_status = 'failed' then 'failed'
        else 'queued'
      end,
      invitation_error = i.last_delivery_error
  from public.tenant_onboarding_invitations i
  where s.batch_id = p_batch_id
    and i.bulk_batch_id = p_batch_id
    and i.source_row_number = s.row_number;

  update public.bulk_import_batches
  set summary = summary || jsonb_build_object(
    'invitations_total', (
      select count(*) from public.tenant_onboarding_invitations where bulk_batch_id = p_batch_id
    )
  )
  where id = p_batch_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'bulk_import.invitations_queued', 'bulk_import_batch', p_batch_id,
    v_batch.file_name,
    jsonb_build_object(
      'tenant_id', v_batch.tenant_id,
      'newly_queued', v_queued,
      'total_queued', (
        select count(*) from public.tenant_onboarding_invitations where bulk_batch_id = p_batch_id
      )
    )
  );
  return jsonb_build_object(
    'batchId', p_batch_id,
    'invitationsQueued', v_queued,
    'totalInvitations', (
      select count(*) from public.tenant_onboarding_invitations where bulk_batch_id = p_batch_id
    )
  );
end;
$$;
revoke all on function public.bulk_import_generate_invitations(uuid)
  from public, anon, authenticated;
grant execute on function public.bulk_import_generate_invitations(uuid) to authenticated;
