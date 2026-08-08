-- SafeBus Alberta - Phase 5 secure bulk onboarding foundation
--
-- Imports are deliberately split into validation and confirmation phases.
-- Browser roles may read their own batch results, but only the SECURITY
-- DEFINER RPCs may create or mutate batches/staging rows. Guardian and driver
-- records are finalized only after a server-side Auth invitation succeeds.

-- Extend the Phase 2 rate limiter with bounded Phase 5 actions.
alter table public.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action_check;
alter table public.rate_limit_buckets
  add constraint rate_limit_buckets_action_check check (
    action in (
      'login', 'invitation', 'password_reset', 'onboarding', 'audit_write',
      'bulk_import', 'bulk_invitation'
    )
  );

create or replace function public.check_rate_limit(
  p_action text,
  p_actor_identifier text,
  p_max integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_actor_hash text;
  v_bucket text;
  v_count integer;
begin
  if p_action is null or p_action not in (
       'login', 'invitation', 'password_reset', 'onboarding', 'audit_write',
       'bulk_import', 'bulk_invitation'
     )
     or nullif(trim(p_actor_identifier), '') is null
     or p_max is null or p_max < 1 or p_max > 10000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_actor_hash := md5(p_actor_identifier);
  v_bucket := p_action || ':' || left(v_actor_hash, 16) || ':'
    || extract(epoch from v_window_start)::bigint::text;

  insert into public.rate_limit_buckets (
    bucket_key, action, actor_identifier, window_start, count
  ) values (v_bucket, p_action, v_actor_hash, v_window_start, 1)
  on conflict (bucket_key, action, actor_identifier, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning count into v_count;

  if v_count > p_max then
    begin
      if auth.uid() is not null then
        perform public.write_audit_event(
          'rate_limit.exceeded', null, null, null, 'denied',
          jsonb_build_object('action', p_action, 'count', v_count, 'max', p_max),
          null
        );
      end if;
    exception when others then null;
    end;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer)
  from public, anon;
grant execute on function public.check_rate_limit(text, text, integer, integer)
  to authenticated, service_role;

create table if not exists public.bulk_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  record_type text not null,
  file_name text,
  status text not null default 'staging',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  dry_run boolean not null default true,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint bulk_import_record_type_check
    check (record_type in ('student', 'guardian', 'driver')),
  constraint bulk_import_status_check
    check (status in ('staging', 'validated', 'committed', 'rolled_back', 'failed')),
  constraint bulk_import_counts_check check (
    total_rows >= 0 and valid_rows >= 0 and error_rows >= 0
    and valid_rows + error_rows <= total_rows
  )
);

create table if not exists public.bulk_import_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.bulk_import_batches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  row_number integer not null,
  record_type text not null,
  row_data jsonb not null,
  validation_status text not null default 'pending',
  validation_errors jsonb not null default '[]'::jsonb,
  dedup_key text,
  live_record_id uuid,
  invitation_status text,
  invitation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bulk_staging_status_check
    check (validation_status in ('valid', 'invalid', 'pending')),
  constraint bulk_staging_record_type_check
    check (record_type in ('student', 'guardian', 'driver')),
  constraint bulk_staging_invitation_status_check
    check (invitation_status is null or invitation_status in ('queued', 'processing', 'sent', 'failed', 'revoked')),
  constraint bulk_staging_batch_row_unique unique (batch_id, row_number)
);

create index if not exists bulk_import_batches_tenant_idx
  on public.bulk_import_batches (tenant_id, created_at desc);
create index if not exists bulk_import_batches_status_idx
  on public.bulk_import_batches (status);
create index if not exists bulk_import_staging_batch_idx
  on public.bulk_import_staging (batch_id, row_number);
create index if not exists bulk_import_staging_valid_idx
  on public.bulk_import_staging (batch_id) where validation_status = 'valid';

alter table public.bulk_import_batches enable row level security;
alter table public.bulk_import_staging enable row level security;
revoke all on public.bulk_import_batches from public, anon, authenticated;
revoke all on public.bulk_import_staging from public, anon, authenticated;

create policy "bulk_import_batches select tenant admin"
  on public.bulk_import_batches for select to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );
create policy "bulk_import_staging select tenant admin"
  on public.bulk_import_staging for select to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );
grant select on public.bulk_import_batches to authenticated;
grant select on public.bulk_import_staging to authenticated;

drop trigger if exists set_updated_at_bulk_import_batches on public.bulk_import_batches;
create trigger set_updated_at_bulk_import_batches
  before update on public.bulk_import_batches
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_bulk_import_staging on public.bulk_import_staging;
create trigger set_updated_at_bulk_import_staging
  before update on public.bulk_import_staging
  for each row execute function public.set_updated_at();

create or replace function public.bulk_import_stage_rows(
  p_record_type text,
  p_rows jsonb,
  p_file_name text default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_tenant_id uuid;
  v_batch_id uuid;
  v_row jsonb;
  v_safe_row jsonb;
  v_row_number integer := 0;
  v_total integer;
  v_valid integer := 0;
  v_errors integer := 0;
  v_validation_status text;
  v_validation_errors jsonb;
  v_dedup_key text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_normalized_phone text;
  v_license text;
  v_school_id uuid;
  v_school_count integer;
  v_issue_date date;
  v_expiry_date date;
  v_key text;
  v_unknown_fields text[];
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';
  if v_caller.id is null or v_caller.role <> 'tenant_admin' then
    raise exception 'Only an active tenant administrator can perform bulk imports.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  v_tenant_id := public.current_tenant_id();

  if p_record_type is null or p_record_type not in ('student', 'guardian', 'driver') then
    raise exception 'Record type must be student, guardian, or driver.' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array.' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 50000 then
    raise exception 'An import must contain between 1 and 50,000 rows.' using errcode = '22023';
  end if;
  if length(coalesce(p_file_name, '')) > 255 then
    raise exception 'File name cannot exceed 255 characters.' using errcode = '22023';
  end if;
  if not public.check_rate_limit('bulk_import', auth.uid()::text, 5, 3600) then
    raise exception 'Too many bulk imports in the last hour. Try again later.' using errcode = '42901';
  end if;

  create temporary table if not exists phase5_seen_identifiers (
    identifier_type text not null,
    identifier_value text not null,
    primary key (identifier_type, identifier_value)
  ) on commit drop;
  truncate table phase5_seen_identifiers;

  insert into public.bulk_import_batches (
    tenant_id, created_by_profile_id, record_type, file_name, status, total_rows, dry_run
  ) values (
    v_tenant_id, v_caller.id, p_record_type, nullif(trim(p_file_name), ''),
    'staging', v_total, coalesce(p_dry_run, true)
  ) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;
    v_validation_errors := '[]'::jsonb;
    v_validation_status := 'valid';
    v_dedup_key := null;
    v_school_id := null;
    v_issue_date := null;
    v_expiry_date := null;

    if jsonb_typeof(v_row) <> 'object' then
      v_validation_errors := jsonb_build_array('Each row must be an object.');
      v_validation_status := 'invalid';
      v_row := '{}'::jsonb;
    end if;

    v_first_name := trim(coalesce(v_row ->> 'first_name', ''));
    v_last_name := trim(coalesce(v_row ->> 'last_name', ''));
    v_email := lower(trim(coalesce(v_row ->> 'email', '')));
    v_phone := trim(coalesce(v_row ->> 'phone', ''));
    v_normalized_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    v_license := upper(trim(coalesce(v_row ->> 'license_number', '')));

    if p_record_type = 'student' then
      select array_agg(key order by key) into v_unknown_fields
      from jsonb_object_keys(v_row) as keys(key)
      where key not in ('first_name', 'last_name', 'preferred_name', 'grade', 'school_id', 'school_name');
      v_safe_row := jsonb_build_object(
        'first_name', v_first_name,
        'last_name', v_last_name,
        'preferred_name', nullif(trim(v_row ->> 'preferred_name'), ''),
        'grade', nullif(trim(v_row ->> 'grade'), ''),
        'school_id', nullif(trim(v_row ->> 'school_id'), '')
      );
    elsif p_record_type = 'guardian' then
      select array_agg(key order by key) into v_unknown_fields
      from jsonb_object_keys(v_row) as keys(key)
      where key not in ('first_name', 'last_name', 'email', 'phone');
      v_safe_row := jsonb_build_object(
        'first_name', v_first_name, 'last_name', v_last_name,
        'email', v_email, 'phone', v_phone
      );
    else
      select array_agg(key order by key) into v_unknown_fields
      from jsonb_object_keys(v_row) as keys(key)
      where key not in (
        'first_name', 'last_name', 'email', 'phone', 'license_number',
        'license_class', 'license_issue_date', 'license_expiry_date',
        'address_line1', 'address_line2', 'city', 'province', 'postal_code'
      );
      v_safe_row := jsonb_build_object(
        'first_name', v_first_name, 'last_name', v_last_name,
        'email', v_email, 'phone', v_phone, 'license_number', v_license,
        'license_class', trim(coalesce(v_row ->> 'license_class', '')),
        'license_issue_date', trim(coalesce(v_row ->> 'license_issue_date', '')),
        'license_expiry_date', trim(coalesce(v_row ->> 'license_expiry_date', '')),
        'address_line1', trim(coalesce(v_row ->> 'address_line1', '')),
        'address_line2', nullif(trim(v_row ->> 'address_line2'), ''),
        'city', trim(coalesce(v_row ->> 'city', '')),
        'province', upper(trim(coalesce(v_row ->> 'province', 'AB'))),
        'postal_code', upper(trim(coalesce(v_row ->> 'postal_code', '')))
      );
    end if;

    if coalesce(array_length(v_unknown_fields, 1), 0) > 0 then
      v_validation_errors := v_validation_errors || jsonb_build_array(
        'Unsupported field(s): ' || array_to_string(v_unknown_fields, ', ') || '.'
      );
      v_validation_status := 'invalid';
    end if;
    if v_first_name = '' or length(v_first_name) > 100 then
      v_validation_errors := v_validation_errors || jsonb_build_array('First name is required (max 100 characters).');
      v_validation_status := 'invalid';
    end if;
    if v_last_name = '' or length(v_last_name) > 100 then
      v_validation_errors := v_validation_errors || jsonb_build_array('Last name is required (max 100 characters).');
      v_validation_status := 'invalid';
    end if;

    if p_record_type = 'student' then
      if length(coalesce(v_row ->> 'preferred_name', '')) > 100
         or length(coalesce(v_row ->> 'grade', '')) > 32 then
        v_validation_errors := v_validation_errors || jsonb_build_array(
          'Preferred name and grade exceed supported lengths.'
        );
        v_validation_status := 'invalid';
      end if;
      if nullif(trim(v_row ->> 'school_id'), '') is not null then
        begin
          v_school_id := trim(v_row ->> 'school_id')::uuid;
        exception when invalid_text_representation then
          v_validation_errors := v_validation_errors || jsonb_build_array('School ID must be a valid identifier.');
          v_validation_status := 'invalid';
        end;
        if v_school_id is not null and not exists (
          select 1 from public.schools s
          where s.id = v_school_id and s.tenant_id = v_tenant_id and s.status = 'active'
        ) then
          v_validation_errors := v_validation_errors || jsonb_build_array('School is not active in this tenant.');
          v_validation_status := 'invalid';
        end if;
      elsif nullif(trim(v_row ->> 'school_name'), '') is not null then
        select count(*), (array_agg(s.id order by s.id))[1]
        into v_school_count, v_school_id
        from public.schools s
        where s.tenant_id = v_tenant_id
          and s.status = 'active'
          and lower(s.name) = lower(trim(v_row ->> 'school_name'));
        if v_school_count <> 1 then
          v_validation_errors := v_validation_errors || jsonb_build_array(
            'School name must match exactly one active school in this tenant.'
          );
          v_validation_status := 'invalid';
        end if;
      else
        v_validation_errors := v_validation_errors || jsonb_build_array(
          'School ID or school name is required for every student.'
        );
        v_validation_status := 'invalid';
      end if;
      if v_school_id is not null then
        v_safe_row := jsonb_set(v_safe_row, '{school_id}', to_jsonb(v_school_id::text), true);
      end if;
      v_dedup_key := lower(v_first_name) || '|' || lower(v_last_name) || '|'
        || coalesce(v_school_id::text, '') || '|' || lower(coalesce(v_row ->> 'grade', ''));
      v_key := v_dedup_key;
    else
      if v_email = '' or length(v_email) > 320 or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
        v_validation_errors := v_validation_errors || jsonb_build_array('A valid email is required.');
        v_validation_status := 'invalid';
      end if;
      if length(v_normalized_phone) < 10 or length(v_phone) > 40 then
        v_validation_errors := v_validation_errors || jsonb_build_array('A valid phone number is required.');
        v_validation_status := 'invalid';
      end if;
      v_dedup_key := v_email;
      v_key := v_email;
    end if;

    if p_record_type = 'driver' then
      begin
        v_issue_date := nullif(trim(v_row ->> 'license_issue_date'), '')::date;
        v_expiry_date := nullif(trim(v_row ->> 'license_expiry_date'), '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_validation_errors := v_validation_errors || jsonb_build_array('Licence dates must be valid ISO dates.');
        v_validation_status := 'invalid';
      end;
      if v_license = '' or length(v_license) > 64 then
        v_validation_errors := v_validation_errors || jsonb_build_array('A valid licence number is required.');
        v_validation_status := 'invalid';
      end if;
      if trim(coalesce(v_row ->> 'license_class', '')) not in ('1','2','3','4','5','6','7')
         or v_issue_date is null or v_expiry_date is null or v_expiry_date < v_issue_date then
        v_validation_errors := v_validation_errors || jsonb_build_array('Complete, valid licence details are required.');
        v_validation_status := 'invalid';
      end if;
      if trim(coalesce(v_row ->> 'address_line1', '')) = ''
         or trim(coalesce(v_row ->> 'city', '')) = ''
         or length(trim(coalesce(v_row ->> 'address_line1', ''))) > 160
         or length(trim(coalesce(v_row ->> 'address_line2', ''))) > 160
         or length(trim(coalesce(v_row ->> 'city', ''))) > 100
         or upper(trim(coalesce(v_row ->> 'province', 'AB'))) !~ '^[A-Z]{2}$'
         or upper(regexp_replace(coalesce(v_row ->> 'postal_code', ''), '\s+', '', 'g')) !~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$' then
        v_validation_errors := v_validation_errors || jsonb_build_array('Complete, valid driver address details are required.');
        v_validation_status := 'invalid';
      end if;
    end if;

    -- O(log n) duplicate checks keep 10k/50k imports practical.
    if nullif(v_key, '') is not null then
      begin
        insert into phase5_seen_identifiers values ('primary', v_key);
      exception when unique_violation then
        v_validation_errors := v_validation_errors || jsonb_build_array('Duplicate primary identifier within this import.');
        v_validation_status := 'invalid';
      end;
    end if;
    if p_record_type in ('guardian', 'driver') and v_normalized_phone <> '' then
      begin
        insert into phase5_seen_identifiers values ('phone', v_normalized_phone);
      exception when unique_violation then
        v_validation_errors := v_validation_errors || jsonb_build_array('Duplicate phone within this import.');
        v_validation_status := 'invalid';
      end;
    end if;
    if p_record_type = 'driver' and v_license <> '' then
      begin
        insert into phase5_seen_identifiers values ('licence', lower(v_license));
      exception when unique_violation then
        v_validation_errors := v_validation_errors || jsonb_build_array('Duplicate licence within this import.');
        v_validation_status := 'invalid';
      end;
    end if;

    if v_validation_status = 'valid' then v_valid := v_valid + 1;
    else v_errors := v_errors + 1;
    end if;

    insert into public.bulk_import_staging (
      batch_id, tenant_id, row_number, record_type, row_data,
      validation_status, validation_errors, dedup_key
    ) values (
      v_batch_id, v_tenant_id, v_row_number, p_record_type, v_safe_row,
      v_validation_status, v_validation_errors, v_dedup_key
    );
  end loop;

  -- Compare staged identifiers with live data using set-based operations. This
  -- avoids tens of thousands of per-row table scans for large imports.
  if p_record_type = 'student' then
    update public.bulk_import_staging staged
    set validation_status = 'invalid',
        validation_errors = validation_errors || jsonb_build_array('A matching student already exists.')
    where staged.batch_id = v_batch_id
      and staged.validation_status = 'valid'
      and exists (
        select 1 from public.students existing
        where existing.tenant_id = v_tenant_id
          and lower(existing.first_name) = lower(staged.row_data ->> 'first_name')
          and lower(existing.last_name) = lower(staged.row_data ->> 'last_name')
          and existing.school_id is not distinct from nullif(staged.row_data ->> 'school_id', '')::uuid
          and lower(coalesce(existing.grade, '')) = lower(coalesce(staged.row_data ->> 'grade', ''))
          and existing.status <> 'archived'
      );
  else
    update public.bulk_import_staging staged
    set validation_status = 'invalid',
        validation_errors = validation_errors || jsonb_build_array('This email is already linked to a SafeBus account.')
    where staged.batch_id = v_batch_id
      and staged.validation_status = 'valid'
      and exists (
        select 1 from public.profiles existing
        where lower(existing.email) = lower(staged.row_data ->> 'email')
      );
  end if;

  if p_record_type = 'guardian' then
    update public.bulk_import_staging staged
    set validation_status = 'invalid',
        validation_errors = validation_errors || jsonb_build_array('A guardian with this email or phone already exists.')
    where staged.batch_id = v_batch_id
      and staged.validation_status = 'valid'
      and exists (
        select 1 from public.guardians existing
        where existing.tenant_id = v_tenant_id
          and (
            lower(existing.email) = lower(staged.row_data ->> 'email')
            or regexp_replace(coalesce(existing.phone, ''), '[^0-9]', '', 'g') =
               regexp_replace(coalesce(staged.row_data ->> 'phone', ''), '[^0-9]', '', 'g')
          )
          and existing.status <> 'archived'
      );
  elsif p_record_type = 'driver' then
    update public.bulk_import_staging staged
    set validation_status = 'invalid',
        validation_errors = validation_errors || jsonb_build_array('A driver with this licence or phone already exists.')
    where staged.batch_id = v_batch_id
      and staged.validation_status = 'valid'
      and exists (
        select 1 from public.drivers existing
        where existing.tenant_id = v_tenant_id
          and (
            lower(existing.license_number) = lower(staged.row_data ->> 'license_number')
            or regexp_replace(coalesce(existing.phone, ''), '[^0-9]', '', 'g') =
               regexp_replace(coalesce(staged.row_data ->> 'phone', ''), '[^0-9]', '', 'g')
          )
          and existing.status <> 'archived'
      );
  end if;

  select count(*) filter (where validation_status = 'valid'),
         count(*) filter (where validation_status = 'invalid')
  into v_valid, v_errors
  from public.bulk_import_staging where batch_id = v_batch_id;

  update public.bulk_import_batches
  set status = 'validated', valid_rows = v_valid, error_rows = v_errors,
      summary = jsonb_build_object(
        'record_type', p_record_type, 'total', v_total,
        'valid', v_valid, 'errors', v_errors,
        'requires_invitations', p_record_type in ('guardian', 'driver')
      )
  where id = v_batch_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'bulk_import.validated', 'bulk_import_batch', v_batch_id,
    nullif(trim(p_file_name), ''),
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'record_type', p_record_type,
      'total', v_total, 'valid', v_valid, 'errors', v_errors,
      'dry_run', coalesce(p_dry_run, true)
    )
  );

  return jsonb_build_object(
    'batchId', v_batch_id, 'totalRows', v_total,
    'validRows', v_valid, 'errorRows', v_errors,
    'dryRun', coalesce(p_dry_run, true),
    'canCommit', (not coalesce(p_dry_run, true)) and v_errors = 0 and v_valid > 0
  );
end;
$$;

revoke all on function public.bulk_import_stage_rows(text, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.bulk_import_stage_rows(text, jsonb, text, boolean)
  to authenticated;

drop function if exists public.bulk_import_commit(uuid);
create function public.bulk_import_commit(p_batch_id uuid, p_confirm boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_batch public.bulk_import_batches;
  v_committed integer := 0;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null or v_caller.role <> 'tenant_admin' then
    raise exception 'Only an active tenant administrator can commit bulk imports.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  if not coalesce(p_confirm, false) then
    raise exception 'Administrator confirmation is required.' using errcode = '22023';
  end if;

  select * into v_batch from public.bulk_import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'Import batch not found.' using errcode = 'P0002'; end if;
  if v_batch.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'You can only commit imports for your tenant.' using errcode = '42501';
  end if;
  if v_batch.status <> 'validated' or v_batch.error_rows <> 0 or v_batch.valid_rows < 1 then
    raise exception 'Only a completely valid batch can be committed.' using errcode = '22023';
  end if;
  if v_batch.dry_run then
    raise exception 'Dry-run batches cannot be committed. Validate again with dry run disabled.' using errcode = '22023';
  end if;
  if (select count(*) from public.bulk_import_staging where batch_id = p_batch_id and validation_status = 'valid') <> v_batch.valid_rows then
    raise exception 'Staging row counts do not match the validated batch.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_batch.tenant_id::text, 1));

  if v_batch.record_type = 'student' then
    -- Recheck under the tenant import lock to close validation/commit races.
    if exists (
      select 1
      from public.bulk_import_staging staged
      join public.students existing
        on existing.tenant_id = v_batch.tenant_id
       and lower(existing.first_name) = lower(staged.row_data ->> 'first_name')
       and lower(existing.last_name) = lower(staged.row_data ->> 'last_name')
       and existing.school_id is not distinct from nullif(staged.row_data ->> 'school_id', '')::uuid
       and lower(coalesce(existing.grade, '')) = lower(coalesce(staged.row_data ->> 'grade', ''))
       and existing.status <> 'archived'
      where staged.batch_id = p_batch_id and staged.validation_status = 'valid'
    ) then
      raise exception 'A matching student was added after validation; revalidate the import.' using errcode = '23505';
    end if;

    update public.bulk_import_staging
    set live_record_id = gen_random_uuid()
    where batch_id = p_batch_id and validation_status = 'valid';

    insert into public.students (
      id, tenant_id, school_id, first_name, last_name, preferred_name, grade, status
    )
    select
      staged.live_record_id,
      v_batch.tenant_id,
      nullif(staged.row_data ->> 'school_id', '')::uuid,
      staged.row_data ->> 'first_name',
      staged.row_data ->> 'last_name',
      nullif(staged.row_data ->> 'preferred_name', ''),
      nullif(staged.row_data ->> 'grade', ''),
      'active'
    from public.bulk_import_staging staged
    where staged.batch_id = p_batch_id and staged.validation_status = 'valid'
    order by staged.row_number;
    get diagnostics v_committed = row_count;
  else
    -- Guardian/driver rows are accepted atomically here, then finalized by the
    -- server invitation queue after an Auth account exists.
    v_committed := v_batch.valid_rows;
  end if;

  update public.bulk_import_batches
  set status = 'committed', committed_at = now(),
      summary = summary || jsonb_build_object('committed', v_committed)
  where id = p_batch_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'bulk_import.committed', 'bulk_import_batch', p_batch_id,
    v_batch.file_name,
    jsonb_build_object(
      'tenant_id', v_batch.tenant_id, 'record_type', v_batch.record_type,
      'committed', v_committed
    )
  );
  return jsonb_build_object(
    'batchId', p_batch_id, 'committed', v_committed,
    'status', 'committed',
    'requiresInvitations', v_batch.record_type in ('guardian', 'driver')
  );
end;
$$;
revoke all on function public.bulk_import_commit(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.bulk_import_commit(uuid, boolean) to authenticated;

create or replace function public.bulk_import_rollback(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_batch public.bulk_import_batches;
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can discard imports.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  select * into v_batch from public.bulk_import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'Import batch not found.' using errcode = 'P0002'; end if;
  if v_batch.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'You can only discard imports for your tenant.' using errcode = '42501';
  end if;
  if v_batch.status = 'committed' then
    raise exception 'Committed batches cannot be discarded.' using errcode = '22023';
  end if;
  update public.bulk_import_batches set status = 'rolled_back' where id = p_batch_id;
  perform public.phase5_write_audit_event(
    auth.uid(), 'bulk_import.rolled_back', 'bulk_import_batch', p_batch_id,
    v_batch.file_name, jsonb_build_object('tenant_id', v_batch.tenant_id)
  );
  return jsonb_build_object('batchId', p_batch_id, 'status', 'rolled_back');
end;
$$;
revoke all on function public.bulk_import_rollback(uuid) from public, anon, authenticated;
grant execute on function public.bulk_import_rollback(uuid) to authenticated;

create or replace function public.bulk_import_get_errors(p_batch_id uuid)
returns table (row_number integer, record_type text, row_data jsonb, validation_errors jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can view import errors.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  if not exists (
    select 1 from public.bulk_import_batches b
    where b.id = p_batch_id and b.tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Import batch not found.' using errcode = 'P0002';
  end if;
  return query
  select s.row_number, s.record_type, s.row_data, s.validation_errors
  from public.bulk_import_staging s
  where s.batch_id = p_batch_id and s.validation_status = 'invalid'
  order by s.row_number;
end;
$$;
revoke all on function public.bulk_import_get_errors(uuid) from public, anon, authenticated;
grant execute on function public.bulk_import_get_errors(uuid) to authenticated;

-- Schema-only integration boundary. Credentials are intentionally excluded;
-- a future connector must keep secrets in a server-side secret manager.
create table if not exists public.sis_integration_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  provider text not null default 'generic',
  display_name text not null,
  status text not null default 'draft',
  settings_json jsonb not null default '{}'::jsonb,
  secret_reference text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sis_provider_check check (
    provider in ('generic', 'powerschool', 'schoolengage', 'csv_roster', 'onecares')
  ),
  constraint sis_status_check check (status in ('draft', 'testing', 'active', 'disabled')),
  constraint sis_no_inline_secrets_check check (
    not (settings_json ?| array['password', 'secret', 'token', 'api_key', 'client_secret'])
  )
);
create index if not exists sis_integration_configs_tenant_idx
  on public.sis_integration_configs (tenant_id);
alter table public.sis_integration_configs enable row level security;
revoke all on public.sis_integration_configs from public, anon, authenticated;
drop trigger if exists set_updated_at_sis_integration_configs on public.sis_integration_configs;
create trigger set_updated_at_sis_integration_configs
  before update on public.sis_integration_configs
  for each row execute function public.set_updated_at();

comment on table public.sis_integration_configs is
  'Schema-only future SIS connector boundary. Browser roles have no access and inline credentials are forbidden.';
