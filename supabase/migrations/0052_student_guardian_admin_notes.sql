-- Student workspace: keep admin-only lifecycle context on each guardian link.
alter table public.student_guardians
  add column if not exists admin_note text,
  add column if not exists status_comment text;

alter table public.student_guardians
  add constraint student_guardians_admin_note_length
    check (admin_note is null or char_length(admin_note) <= 500),
  add constraint student_guardians_status_comment_length
    check (status_comment is null or char_length(status_comment) <= 300);

create or replace function public.admin_set_student_guardian_status(
  p_link_id uuid,
  p_status text,
  p_comment text default null,
  p_admin_note text default null
)
returns public.student_guardians
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_link public.student_guardians;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.is_transportation_write_admin() then
    raise exception 'Only an admin can update guardian links.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Invalid guardian link status.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(p_comment), '')) > 300
     or char_length(coalesce(btrim(p_admin_note), '')) > 500 then
    raise exception 'Guardian link comments are too long.' using errcode = '22023';
  end if;

  select * into v_link
  from public.student_guardians
  where id = p_link_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Link not found in your tenant.' using errcode = 'P0002';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.guardians g
    where g.id = v_link.guardian_id
      and g.tenant_id = v_tenant_id
      and g.status = 'active'
  ) then
    raise exception 'Guardian must be active before this link can be activated.' using errcode = '55000';
  end if;

  update public.student_guardians
  set status = p_status,
      status_comment = nullif(btrim(p_comment), ''),
      admin_note = nullif(btrim(p_admin_note), '')
  where id = p_link_id
  returning * into v_link;

  return v_link;
end;
$$;

revoke all on function public.admin_set_student_guardian_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_student_guardian_status(uuid, text, text, text) to authenticated;

comment on function public.admin_set_student_guardian_status(uuid, text, text, text) is
  'Tenant-scoped admin operation for activating/deactivating a guardian-student relationship with private admin context.';
