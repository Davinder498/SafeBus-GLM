-- SafeBus Alberta - secure guardian-student linking RPC
--
-- Milestone 5B Codex fix: move guardian-student link create/reactivate/
-- deactivate to a SECURITY DEFINER RPC so the database validates that both
-- the student and guardian belong to the caller's tenant — not just the
-- link row's tenant_id.
--
-- Problem:
--   The existing RLS policies on student_guardians (from 0015) only check
--   tenant_id = current_tenant_id(). A tampered client could insert a link
--   referencing a student_id or guardian_id from another tenant, as long as
--   the link row's tenant_id matches the caller's tenant. The FK proves the
--   referenced row exists but not that it belongs to the same tenant.
--
-- Fix (Option A — RPC-only writes):
--   1. Create admin_link_student_guardian() RPC for create/reactivate.
--   2. Create admin_deactivate_student_guardian() RPC for deactivation.
--   3. Drop direct INSERT/UPDATE policies on student_guardians.
--   4. Revoke INSERT/UPDATE grants from authenticated.
--   5. The RPCs are SECURITY DEFINER and validate everything internally.
--
-- No tables are altered. No data is deleted. No recursive RLS paths.

-- ---------------------------------------------------------------------------
-- RPC: admin_link_student_guardian
--
-- Accepts ONLY: p_student_id, p_guardian_id, p_relationship, optional
-- p_can_receive_notifications. Derives tenant_id from current_tenant_id().
-- Validates that both student and guardian are active and in the caller's
-- tenant. If an active link exists, raises a friendly duplicate error. If an
-- inactive link exists, reactivates it. If no link exists, inserts a new one.
-- Handles race-condition unique violations deterministically.
-- ---------------------------------------------------------------------------
create or replace function public.admin_link_student_guardian(
  p_student_id uuid,
  p_guardian_id uuid,
  p_relationship text default 'guardian',
  p_can_receive_notifications boolean default true
)
returns public.student_guardians
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_existing public.student_guardians;
  v_result public.student_guardians;
begin
  -- 1. Caller must be authenticated.
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- 2. Caller must be a transportation write admin.
  if not public.is_transportation_write_admin() then
    raise exception 'Only an admin can link students to guardians.' using errcode = '42501';
  end if;

  -- 3. Validate relationship value.
  if p_relationship not in ('mother', 'father', 'guardian', 'caregiver', 'other') then
    raise exception 'Invalid relationship value.' using errcode = '22023';
  end if;

  -- 4. Verify the student exists, is active, and belongs to the caller's tenant.
  if not exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.tenant_id = v_tenant_id
      and s.status = 'active'
  ) then
    raise exception 'Student not found in your tenant.' using errcode = 'P0002';
  end if;

  -- 5. Verify the guardian exists, is active, and belongs to the caller's tenant.
  if not exists (
    select 1 from public.guardians g
    where g.id = p_guardian_id
      and g.tenant_id = v_tenant_id
      and g.status = 'active'
  ) then
    raise exception 'Guardian not found in your tenant.' using errcode = 'P0002';
  end if;

  -- 6. Check for an existing link (any status) for this student + guardian
  --    IN THE CALLER'S TENANT. This prevents reactivating a cross-tenant link.
  select * into v_existing
  from public.student_guardians
  where student_id = p_student_id
    and guardian_id = p_guardian_id
    and tenant_id = v_tenant_id
  for update;

  -- 7. If an active link already exists, raise a friendly duplicate error.
  if found and v_existing.status = 'active' then
    raise exception 'This student is already linked to this guardian.' using errcode = '55006';
  end if;

  -- 8. If an inactive link exists, reactivate it.
  if found then
    update public.student_guardians
    set status = 'active',
        relationship = p_relationship,
        can_receive_notifications = p_can_receive_notifications
    where id = v_existing.id
    returning * into v_result;

    return v_result;
  end if;

  -- 9. No existing link — insert a new one. Handle race-condition unique violation.
  begin
    insert into public.student_guardians (
      tenant_id, student_id, guardian_id, relationship,
      can_receive_notifications, status
    )
    values (
      v_tenant_id, p_student_id, p_guardian_id, p_relationship,
      p_can_receive_notifications, 'active'
    )
    returning * into v_result;
  exception
    when unique_violation then
      -- Another concurrent request created the link. Treat as duplicate.
      raise exception 'This student is already linked to this guardian.' using errcode = '55006';
  end;

  return v_result;
end;
$$;

comment on function public.admin_link_student_guardian(uuid, uuid, text, boolean) is
  'Tenant-admin-only RPC to create or reactivate a guardian-student link. '
  'Validates that both student and guardian are active and in the caller''s '
  'tenant. Reactivates inactive links. Handles race conditions. SECURITY DEFINER.';

revoke all on function public.admin_link_student_guardian(uuid, uuid, text, boolean) from public;
revoke all on function public.admin_link_student_guardian(uuid, uuid, text, boolean) from anon;
grant execute on function public.admin_link_student_guardian(uuid, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin_deactivate_student_guardian
--
-- Accepts ONLY: p_link_id. Validates that the link belongs to the caller's
-- tenant and that the caller is a transportation write admin. Sets status to
-- 'inactive'. Does not hard-delete.
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_student_guardian(p_link_id uuid)
returns public.student_guardians
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.student_guardians;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_transportation_write_admin() then
    raise exception 'Only an admin can deactivate links.' using errcode = '42501';
  end if;

  select * into v_link
  from public.student_guardians
  where id = p_link_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Link not found in your tenant.' using errcode = 'P0002';
  end if;

  update public.student_guardians
  set status = 'inactive'
  where id = p_link_id
  returning * into v_link;

  return v_link;
end;
$$;

comment on function public.admin_deactivate_student_guardian(uuid) is
  'Tenant-admin-only RPC to deactivate a guardian-student link. Validates '
  'tenant membership. Does not hard-delete. SECURITY DEFINER.';

revoke all on function public.admin_deactivate_student_guardian(uuid) from public;
revoke all on function public.admin_deactivate_student_guardian(uuid) from anon;
grant execute on function public.admin_deactivate_student_guardian(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Harden student_guardians write RLS: remove direct INSERT/UPDATE.
-- The RPCs above are now the only write paths.
-- ---------------------------------------------------------------------------
drop policy if exists "student guardians insert admin" on public.student_guardians;
drop policy if exists "student guardians update admin" on public.student_guardians;

revoke insert, update on table public.student_guardians from authenticated;

-- SELECT policies and grants remain unchanged (from 0003 + 0015).
